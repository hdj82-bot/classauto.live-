import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssessmentType(str, enum.Enum):
    formative = "formative"    # 형성평가: 강의 중간
    summative = "summative"    # 총괄평가: 영상 종료 후


class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"  # 객관식
    short_answer = "short_answer"        # 주관식


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment_type: Mapped[AssessmentType] = mapped_column(
        SAEnum(AssessmentType), nullable=False, index=True
    )
    question_type: Mapped[QuestionType] = mapped_column(
        SAEnum(QuestionType), nullable=False
    )
    difficulty: Mapped[Difficulty] = mapped_column(
        SAEnum(Difficulty), nullable=False, server_default="medium"
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 객관식 선택지: ["선택지A", "선택지B", "선택지C", "선택지D"]
    options: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # 객관식: 정답 인덱스 str("0"~"3"), 주관식: 모범답안
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 형성평가 전용: 영상 내 출제 시점(초)
    timestamp_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    lecture = relationship("Lecture", backref="questions")
    responses = relationship("Response", back_populates="question", cascade="all, delete-orphan")
