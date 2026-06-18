"""Feedback 모델 (인앱 피드백 수집 — 교수/학생 공통).

베타 기간 흩어진 이메일 대신 유저·강의에 묶어 운영자 콘솔로 모은다. 유저가
삭제돼도 피드백 본문은 보존(FK SET NULL + user_email 스냅샷).
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "professor" | "student".
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # "bug" | "idea" | "confusing" | "other".
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # 맥락(선택) — 어떤 강의에서 제출했는지.
    lecture_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lectures.id", ondelete="SET NULL"), nullable=True
    )
    # 제출 라우트(선택).
    page: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "open" | "triaged" | "resolved".
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", server_default="open"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
