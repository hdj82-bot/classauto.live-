"""IFL HeyGen — SessionLog 모델 (학습 세션 집중도 추적)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SessionLog(Base):
    """학습 세션별 집중도 및 무반응 기록 테이블."""

    __tablename__ = "session_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    lecture_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # 집중 경고 상태
    warning_level: Mapped[int] = mapped_column(Integer, default=0)  # 0~3
    no_response_cnt: Mapped[int] = mapped_column(Integer, default=0)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)

    # 네트워크 상태
    is_network_unstable: Mapped[bool] = mapped_column(Boolean, default=False)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 시청 진행
    progress_seconds: Mapped[int] = mapped_column(Integer, default=0)
    total_pause_seconds: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
