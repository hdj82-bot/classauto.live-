"""VideoRender & RenderCostLog 모델 (app/ VideoRender 흡수)."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RenderStatus(str, enum.Enum):
    """렌더 작업 상태.

    멤버 이름과 value 모두 lowercase 로 통일 — SessionStatus·PlanType 패턴 일치.
    historical UPPER value("PENDING" 등) 를 사용하던 데이터는 alembic 0015 가
    PostgreSQL ENUM RENAME VALUE / SQLite UPDATE 로 lowercase 로 마이그레이션.
    """
    pending = "pending"
    tts_processing = "tts_processing"
    rendering = "rendering"
    uploading = "uploading"
    ready = "ready"
    failed = "failed"
    cancelled = "cancelled"


class VideoRender(Base):
    """HeyGen 아바타 렌더링 작업 추적 테이블."""
    __tablename__ = "video_renders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True
    )

    # HeyGen
    heygen_job_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    avatar_id: Mapped[str] = mapped_column(String(255), nullable=False)

    # TTS
    tts_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="elevenlabs")
    audio_url: Mapped[str | None] = mapped_column(String(1024))
    # 이 음원을 합성할 때 쓴 보이스/속도 — "다시 제작" 이 음성·속도 변경을 감지해
    # 해당 슬라이드만 재합성하기 위한 기록. NULL = 구버전 렌더(텍스트 기준으로만 비교).
    voice_id: Mapped[str | None] = mapped_column(String(255))
    voice_speed: Mapped[float | None] = mapped_column(Float)

    # 슬라이드별 스크립트
    script_text: Mapped[str | None] = mapped_column(Text)
    slide_number: Mapped[int | None] = mapped_column(Integer)

    # 자막 정밀 싱크용 cue (Forced Alignment 로 산출한 실제 발성 시각).
    # 형식: [{"start": float, "end": float, "text": "문장"}, ...]
    # 시각은 이 슬라이드 음성(audio_url)의 자체 타임라인(0-base, 속도 후처리 반영).
    # NULL = 정렬 미수행/실패 — 플레이어는 글자수 균등분배 폴백으로 자막을 싱크한다.
    subtitle_cues: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # 결과
    status: Mapped[RenderStatus] = mapped_column(
        SAEnum(RenderStatus), default=RenderStatus.pending, nullable=False, index=True
    )
    heygen_video_url: Mapped[str | None] = mapped_column(String(1024))
    s3_video_url: Mapped[str | None] = mapped_column(String(1024))
    error_message: Mapped[str | None] = mapped_column(Text)

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 관계
    # T7: Lecture.video_renders 와 양방향 — back_populates 로 명시.
    lecture = relationship("Lecture", back_populates="video_renders")
    cost_logs: Mapped[list["RenderCostLog"]] = relationship(
        back_populates="video_render", cascade="all, delete-orphan"
    )


class RenderCostLog(Base):
    """렌더링 파이프라인 API 호출 비용 로그."""
    __tablename__ = "render_cost_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    video_render_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("video_renders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service: Mapped[str] = mapped_column(String(50), nullable=False)
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    metadata_json: Mapped[str | None] = mapped_column(Text)
    # T5: admin.get_costs 가 월별 GROUP BY 에 created_at 을 사용 — 색인 필수.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )

    video_render: Mapped[VideoRender] = relationship(back_populates="cost_logs")


class WebhookEventLog(Base):
    """외부 웹훅 이벤트 수신 로그 (멱등성 보장용).

    `(provider, external_id, event_type)`에 UNIQUE 제약을 걸어
    동일 이벤트의 중복 처리를 차단한다. HeyGen은 `external_id=video_id`,
    `event_type=avatar_video.success|avatar_video.fail`을 사용한다.
    """
    __tablename__ = "webhook_event_logs"
    __table_args__ = (
        UniqueConstraint(
            "provider", "external_id", "event_type",
            name="uq_webhook_event_logs_provider_external_event",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
