import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SessionStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    qa_mode = "qa_mode"
    paused = "paused"
    assessment = "assessment"
    completed = "completed"


# 세션 상태 머신 전이 규칙 (NestJS session-state.ts 포팅)
SESSION_TRANSITIONS: dict[SessionStatus, list[SessionStatus]] = {
    SessionStatus.not_started: [SessionStatus.in_progress],
    SessionStatus.in_progress: [
        SessionStatus.qa_mode,
        SessionStatus.paused,
        SessionStatus.assessment,
        SessionStatus.completed,
    ],
    SessionStatus.qa_mode: [SessionStatus.in_progress, SessionStatus.paused],
    SessionStatus.paused: [SessionStatus.in_progress],
    SessionStatus.assessment: [SessionStatus.in_progress, SessionStatus.completed],
    SessionStatus.completed: [],
}


def can_transition(from_status: SessionStatus, to_status: SessionStatus) -> bool:
    return to_status in SESSION_TRANSITIONS.get(from_status, [])


def get_allowed_transitions(from_status: SessionStatus) -> list[SessionStatus]:
    return SESSION_TRANSITIONS.get(from_status, [])


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus), default=SessionStatus.not_started, nullable=False
    )
    progress_seconds: Mapped[int] = mapped_column(default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # 집중도 추적 (app/ SessionLog 흡수)
    warning_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    no_response_cnt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_network_unstable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_pause_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pause_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # 시청 진행 (NestJS 포팅)
    watched_sec: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_sec: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", backref="sessions")
    lecture = relationship("Lecture", back_populates="sessions")
