"""IFL HeyGen — VideoRender & CostLog 모델."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VideoRender(Base):
    """HeyGen 아바타 렌더링 작업 추적 테이블."""

    __tablename__ = "video_renders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    instructor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # HeyGen 관련
    heygen_job_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    avatar_id: Mapped[str] = mapped_column(String(255), nullable=False)

    # TTS 관련
    tts_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="elevenlabs")
    audio_url: Mapped[str | None] = mapped_column(String(1024))

    # 슬라이드별 스크립트
    script_text: Mapped[str | None] = mapped_column(Text)
    slide_number: Mapped[int | None] = mapped_column()

    # 결과
    status: Mapped[str] = mapped_column(
        Enum("PENDING", "TTS_PROCESSING", "RENDERING", "UPLOADING", "READY", "FAILED", name="render_status"),
        default="PENDING",
        index=True,
    )
    heygen_video_url: Mapped[str | None] = mapped_column(String(1024))
    s3_video_url: Mapped[str | None] = mapped_column(String(1024))
    error_message: Mapped[str | None] = mapped_column(Text)

    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 관계
    cost_logs: Mapped[list[CostLog]] = relationship(back_populates="video_render", cascade="all, delete-orphan")


class CostLog(Base):
    """API 호출 비용 로그."""

    __tablename__ = "cost_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_render_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("video_renders.id", ondelete="CASCADE"), index=True
    )
    service: Mapped[str] = mapped_column(String(50), nullable=False)  # heygen, elevenlabs, google_tts, s3
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    metadata_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    video_render: Mapped[VideoRender] = relationship(back_populates="cost_logs")
