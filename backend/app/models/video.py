"""Video 및 VideoScript 모델."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VideoStatus(str, enum.Enum):
    draft = "draft"                    # AI 스크립트 생성 전
    pending_review = "pending_review"  # 스크립트 생성 완료, 교수자 검토 대기
    rendering = "rendering"            # 최종 승인 → HeyGen 렌더링 중
    done = "done"                      # 렌더링 완료
    archived = "archived"              # 보관


class ToneTag(str, enum.Enum):
    normal = "normal"          # 기본
    emphasis = "emphasis"      # 강조
    soft = "soft"              # 부드럽게
    fast = "fast"              # 빠르게


class Video(Base):
    """강의 영상 (HeyGen 생성 대상)."""
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[VideoStatus] = mapped_column(
        SAEnum(VideoStatus), default=VideoStatus.draft, nullable=False, index=True
    )
    heygen_video_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    lecture = relationship("Lecture", backref="videos")
    script = relationship(
        "VideoScript", back_populates="video", uselist=False, cascade="all, delete-orphan"
    )


class VideoScript(Base):
    """
    영상 스크립트 (슬라이드별 타임라인).

    segments 컬럼 형식 (JSONB array):
    [
      {
        "slide_index": 0,          // 0-based
        "text": "...",             // 발화 텍스트
        "start_seconds": 0,        // 해당 슬라이드 시작(초)
        "end_seconds": 30,         // 해당 슬라이드 끝(초)
        "tone": "normal",          // normal | emphasis | soft | fast
        "question_pin_seconds": 25 // 질문 타이밍 핀 (null = 없음)
      },
      ...
    ]
    """
    __tablename__ = "video_scripts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    video_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    # AI 최초 생성 스크립트 (덮어쓰기 방지용 원본 보존)
    ai_segments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # 교수자가 편집한 최종 스크립트
    segments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    video = relationship("Video", back_populates="script")
    approved_by = relationship("User", foreign_keys=[approved_by_id])
