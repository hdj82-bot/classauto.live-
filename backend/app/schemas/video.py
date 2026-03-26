"""Video / Script 스키마."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ── 세그먼트 ──────────────────────────────────────────────────────────────────

ToneTag = Literal["normal", "emphasis", "soft", "fast"]


class ScriptSegment(BaseModel):
    """슬라이드 한 장 분량의 스크립트 세그먼트."""
    slide_index: int = Field(..., ge=0, description="슬라이드 인덱스 (0-based)")
    text: str = Field(..., min_length=1, description="발화 텍스트")
    start_seconds: int = Field(..., ge=0, description="슬라이드 시작 시각(초)")
    end_seconds: int = Field(..., ge=0, description="슬라이드 종료 시각(초)")
    tone: ToneTag = Field(default="normal", description="발화 톤 태그")
    question_pin_seconds: int | None = Field(
        default=None, ge=0, description="질문 타이밍 핀 (초, null=없음)"
    )


# ── 스크립트 조회 응답 ────────────────────────────────────────────────────────

class VideoScriptResponse(BaseModel):
    """GET /api/videos/{id}/script 응답."""
    model_config = ConfigDict(from_attributes=True)

    video_id: uuid.UUID
    status: str
    segments: list[ScriptSegment]
    ai_segments: list[ScriptSegment] | None = None   # 원본 AI 스크립트
    approved_at: datetime | None
    approved_by_id: uuid.UUID | None
    updated_at: datetime


# ── 스크립트 수정 요청 ────────────────────────────────────────────────────────

class ScriptPatchRequest(BaseModel):
    """PATCH /api/videos/{id}/script 요청."""
    segments: list[ScriptSegment] = Field(..., min_length=1)


# ── 승인·보관 응답 ────────────────────────────────────────────────────────────

class VideoStatusResponse(BaseModel):
    """상태 변경 후 반환."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    updated_at: datetime
