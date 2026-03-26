import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Response(Base):
    """학습자의 문항 응답."""
    __tablename__ = "responses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    # 객관식: 자동 채점, 주관식: None (수동 채점 또는 AI 채점)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # 응답 시점의 영상 재생 위치(초) — 부정행위 감지용
    video_timestamp_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    # 타임스탬프 일치 여부 (형성평가: 허용 오차 내 응답 여부)
    timestamp_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    responded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session = relationship("LearningSession", backref="responses")
    question = relationship("Question", back_populates="responses")
