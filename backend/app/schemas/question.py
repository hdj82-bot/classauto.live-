import uuid

from pydantic import BaseModel, ConfigDict, Field


# ── 문제 생성 요청 (교수자) ───────────────────────────────────────────────────

class QuestionGenerateRequest(BaseModel):
    """Claude API를 통한 AI 문제 자동 생성 요청."""
    ppt_content: str = Field(..., min_length=10, description="PPT 슬라이드 텍스트 (순서대로)")
    formative_count: int = Field(default=6, ge=1, le=20, description="형성평가 문항 풀 크기")
    summative_count: int = Field(default=10, ge=1, le=30, description="총괄평가 문항 풀 크기")
    video_duration_seconds: int = Field(..., ge=0, description="영상 전체 길이(초) — 타임스탬프 분배에 사용")


# ── 공개 응답 스키마 (correct_answer / explanation 제외) ─────────────────────

class QuestionPublic(BaseModel):
    """학습자에게 노출되는 문제 (정답·해설 미포함)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_type: str
    question_type: str
    difficulty: str
    content: str
    options: list[str] | None
    timestamp_seconds: int | None


class QuestionWithAnswer(BaseModel):
    """응답 조회 시 정답·해설 포함 버전."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_type: str
    question_type: str
    difficulty: str
    content: str
    options: list[str] | None
    correct_answer: str | None
    explanation: str | None
    timestamp_seconds: int | None


# ── 문제 풀 응답 ─────────────────────────────────────────────────────────────

class QuestionSetResponse(BaseModel):
    """GET /api/questions/{lecture_id} 응답."""
    lecture_id: uuid.UUID
    session_id: uuid.UUID
    assessment_type: str
    questions: list[QuestionPublic]
    total_in_pool: int      # 풀 전체 크기
    served_count: int       # 이번 회차 제공 수


class GenerateResponse(BaseModel):
    lecture_id: uuid.UUID
    formative_created: int
    summative_created: int
    message: str
