"""소크라테스식 인터랙티브 퀴즈 저작 스키마.

기존 일괄 자동 생성(schemas/question.py)과 달리, 교수자가 클로드와 다중 턴 대화로
한 슬라이드 경계에 들어갈 퀴즈 1문항을 다듬어 확정하는 흐름을 위한 DTO 모음.
난이도는 상=hard / 중=medium / 하=easy 로 매핑된다(프론트는 상/중/하 표기).
"""
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionTypeLit = Literal["multiple_choice", "short_answer"]
DifficultyLit = Literal["easy", "medium", "hard"]


# ── 대화 ──────────────────────────────────────────────────────────────────────

class SocraticMessage(BaseModel):
    """대화 1턴. 프론트가 전체 히스토리를 보유하고 매 요청에 함께 보낸다(stateless)."""
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class QuizDraft(BaseModel):
    """대화 도중 클로드가 제시하는 현재 최선 문제 초안 (확정 전)."""
    question_type: QuestionTypeLit
    difficulty: DifficultyLit
    content: str
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class SocraticTurnRequest(BaseModel):
    """POST /api/lectures/{lecture_id}/quiz/socratic 요청."""
    insert_after_slide_index: int = Field(..., ge=0, description="슬라이드 N↔N+1 사이의 0-based N")
    question_type: QuestionTypeLit = "multiple_choice"
    difficulty: DifficultyLit = "medium"
    # 비어 있으면 첫 턴(클로드가 먼저 초안을 제시). 비용 방어용 상한.
    messages: list[SocraticMessage] = Field(default_factory=list, max_length=40)


class SocraticTurnResponse(BaseModel):
    """대화 1턴 결과. (비용은 §05 정책상 응답에 미포함 — 서버 CostLog 기록만)"""
    reply: str
    draft: QuizDraft | None = None
    done: bool = False


# ── 확정/저장 ─────────────────────────────────────────────────────────────────

class QuizConfirmRequest(BaseModel):
    """POST /api/lectures/{lecture_id}/quiz/confirm 요청 — 확정된 문제를 저장."""
    insert_after_slide_index: int = Field(..., ge=0)
    question_type: QuestionTypeLit
    difficulty: DifficultyLit = "medium"
    content: str = Field(..., min_length=1)
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class QuizConfirmResponse(BaseModel):
    id: uuid.UUID
    insert_after_slide_index: int
    timestamp_seconds: int | None
    message: str


# ── 패널 재수화 ───────────────────────────────────────────────────────────────

class AuthoredQuizItem(BaseModel):
    """GET /api/lectures/{lecture_id}/quiz 의 개별 항목 (교수자 전용 — 정답·해설 포함)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    insert_after_slide_index: int | None
    question_type: str
    difficulty: str
    content: str
    options: list[str] | None
    correct_answer: str | None
    explanation: str | None
    timestamp_seconds: int | None


class AuthoredQuizListResponse(BaseModel):
    lecture_id: uuid.UUID
    quizzes: list[AuthoredQuizItem]
