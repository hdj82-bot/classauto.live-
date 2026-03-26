import uuid
from datetime import datetime

from sqlalchemy import String, ForeignKey, DateTime, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.base import Base


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    paused = "paused"


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
        SAEnum(SessionStatus), default=SessionStatus.in_progress, nullable=False
    )
    progress_seconds: Mapped[int] = mapped_column(default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user = relationship("User", backref="sessions")
    lecture = relationship("Lecture", back_populates="sessions")
