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
    # 수정 중인 현재 문제(있으면). 저장된 문제를 다시 열어 다듬을 때 모델에 컨텍스트로 전달.
    current_draft: QuizDraft | None = None


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
    # 학생이 영상에서 푼 직후 정답·해설을 공개할지. false = 비공개(대면 활용).
    reveal_answer: bool = True


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
    reveal_answer: bool


class AuthoredQuizListResponse(BaseModel):
    lecture_id: uuid.UUID
    quizzes: list[AuthoredQuizItem]


# ── 학생 재생용 (정답·해설 미포함) ────────────────────────────────────────────

class PlaybackQuizItem(BaseModel):
    """GET /api/lectures/{lecture_id}/quiz/playback — 영상 재생 중 트리거할 퀴즈.

    부정행위 방지: 정답(correct_answer)·해설(explanation)은 절대 포함하지 않는다.
    reveal_answer 는 '제출 후 정답을 공개하는 모드인지' 만 알려준다(정답 자체 아님).
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_type: str
    difficulty: str
    content: str
    options: list[str] | None
    timestamp_seconds: int | None
    insert_after_slide_index: int | None
    reveal_answer: bool


class PlaybackQuizListResponse(BaseModel):
    lecture_id: uuid.UUID
    quizzes: list[PlaybackQuizItem]


# ── 학생 응답 (인터스티셜) ────────────────────────────────────────────────────

class InterstitialAnswerRequest(BaseModel):
    """POST /api/lectures/{lecture_id}/quiz/answer — 영상 중 퀴즈 1문항 응답."""
    session_id: uuid.UUID
    question_id: uuid.UUID
    user_answer: str = Field(..., min_length=1, max_length=4000)
    video_timestamp_seconds: int = Field(..., ge=0, le=24 * 60 * 60)


class InterstitialAnswerResult(BaseModel):
    """응답 기록 결과. reveal_answer=false 면 정/오답·정답·해설을 모두 숨긴다(완전 비공개)."""
    recorded: bool
    reveal: bool
    timestamp_valid: bool
    # reveal=true 일 때만 채워진다. (객관식 correct_answer 는 정답 인덱스 "0"~"3")
    is_correct: bool | None = None
    correct_answer: str | None = None
    explanation: str | None = None
