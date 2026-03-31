"""VideoRender & RenderCostLog 모델 (app/ VideoRender 흡수)."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RenderStatus(str, enum.Enum):
    pending = "PENDING"
    tts_processing = "TTS_PROCESSING"
    rendering = "RENDERING"
    uploading = "UPLOADING"
    ready = "READY"
    failed = "FAILED"


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

    # 슬라이드별 스크립트
    script_text: Mapped[str | None] = mapped_column(Text)
    slide_number: Mapped[int | None] = mapped_column(Integer)

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

    # 관계
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    video_render: Mapped[VideoRender] = relationship(back_populates="cost_logs")
