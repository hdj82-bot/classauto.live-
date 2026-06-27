"""QALog 모델 (app/ qa + NestJS QALog 통합)."""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QALog(Base):
    """RAG Q&A 로그."""
    __tablename__ = "qa_logs"

    # 강의별 최신순 조회(대시보드 요약·Q&A 목록·내보내기)가 핫패스라
    # (lecture_id 필터 + created_at 정렬)을 한 번에 커버하는 복합 인덱스.
    __table_args__ = (
        Index("ix_qa_logs_lecture_created", "lecture_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    in_scope: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    responded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    timestamp: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # 유사도 검색 결과
    top_slide_numbers: Mapped[str | None] = mapped_column(String(64), nullable=True)
    top_similarity: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 토큰/비용 추적
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", backref="qa_logs")
