import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.question import QuestionWithAnswer


# ── 응답 제출 ─────────────────────────────────────────────────────────────────

class SingleResponse(BaseModel):
    question_id: uuid.UUID
    user_answer: str = Field(..., min_length=1)
    video_timestamp_seconds: int = Field(..., ge=0, description="응답 시점의 영상 재생 위치(초)")


class SubmitResponsesRequest(BaseModel):
    session_id: uuid.UUID
    responses: list[SingleResponse] = Field(..., min_length=1)


# ── 응답 결과 ─────────────────────────────────────────────────────────────────

class ResponseResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: uuid.UUID
    user_answer: str
    is_correct: bool | None
    video_timestamp_seconds: int
    timestamp_valid: bool
    responded_at: datetime
    question: QuestionWithAnswer


class SessionScore(BaseModel):
    total: int
    correct: int
    incorrect: int
    short_answer_pending: int   # 주관식 (자동 채점 불가)
    timestamp_violations: int   # 타임스탬프 불일치 횟수


class SessionResponsesResult(BaseModel):
    """GET /api/responses/{session_id} 응답."""
    model_config = ConfigDict(from_attributes=True)

    session_id: uuid.UUID
    score: SessionScore
    responses: list[ResponseResult]
