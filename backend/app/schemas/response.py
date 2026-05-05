import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.question import QuestionWithAnswer

# 강의 영상 길이 상한 — 24h. 클라이언트가 비현실적으로 큰 timestamp 를
# 보내 채점 로직(±tolerance) 을 우회하거나 DB INT 한도에 영향주는 것을 차단.
_MAX_VIDEO_TIMESTAMP_SECONDS = 24 * 60 * 60


# ── 응답 제출 ─────────────────────────────────────────────────────────────────

class SingleResponse(BaseModel):
    question_id: uuid.UUID
    user_answer: str = Field(..., min_length=1, max_length=4000)
    video_timestamp_seconds: int = Field(
        ...,
        ge=0,
        le=_MAX_VIDEO_TIMESTAMP_SECONDS,
        description="응답 시점의 영상 재생 위치(초). 0 이상 24h 이하.",
    )

    @field_validator("user_answer")
    @classmethod
    def _strip_user_answer(cls, v: str) -> str:
        # 객관식("2 ", "  3" 등) 비교 실패 사례 방지 + 양 끝 공백 제거.
        # 채점은 case-insensitive trim 비교로 통일하므로 여기서 정규화한다.
        stripped = v.strip()
        if not stripped:
            raise ValueError("user_answer 가 공백만 포함합니다.")
        return stripped


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
