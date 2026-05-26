import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, Text, func
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
    __table_args__ = (
        # T5: get_questions_for_session 의 (lecture_id, assessment_type) 핫 패스 색인.
        Index("ix_questions_lecture_assessment", "lecture_id", "assessment_type"),
    )

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
    # 소크라테스식 대화로 저작한 인터랙티브 퀴즈가 "슬라이드 N↔N+1 사이"에 삽입됨을
    # 0-based index N 으로 기록. NOT NULL = 인터랙티브 퀴즈(일괄 자동 생성은 NULL).
    insert_after_slide_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # T7: Lecture.questions 가 cascade="all, delete-orphan" 으로 명시되므로
    # backref 대신 back_populates 로 양쪽 명시 (이중 등록 방지).
    lecture = relationship("Lecture", back_populates="questions")
    responses = relationship("Response", back_populates="question", cascade="all, delete-orphan")
