"""IFL HeyGen — Pydantic 스키마."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ── Enums ───────────────────────────────────────────────────
class RenderStatus(str, Enum):
    PENDING = "PENDING"
    TTS_PROCESSING = "TTS_PROCESSING"
    RENDERING = "RENDERING"
    UPLOADING = "UPLOADING"
    READY = "READY"
    FAILED = "FAILED"


class TTSProvider(str, Enum):
    ELEVENLABS = "elevenlabs"
    GOOGLE_TTS = "google_tts"


# ── 렌더 요청 ───────────────────────────────────────────────
class RenderRequest(BaseModel):
    lecture_id: uuid.UUID
    instructor_id: uuid.UUID
    scripts: list[SlideScriptInput] = Field(..., min_length=1, description="슬라이드별 스크립트 목록")
    avatar_id: str | None = Field(default=None, description="HeyGen 아바타 ID (미지정 시 기본값)")
    tts_provider: TTSProvider = Field(default=TTSProvider.ELEVENLABS)


class SlideScriptInput(BaseModel):
    slide_number: int
    script: str = Field(..., min_length=1, description="발화 스크립트")


class RenderResponse(BaseModel):
    render_ids: list[uuid.UUID]
    message: str = "렌더링 파이프라인이 시작되었습니다."


# ── 상태 조회 ───────────────────────────────────────────────
class RenderStatusResponse(BaseModel):
    id: uuid.UUID
    lecture_id: uuid.UUID
    slide_number: int | None
    status: RenderStatus
    s3_video_url: str | None
    tts_provider: str
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None


class LectureRenderStatusResponse(BaseModel):
    lecture_id: uuid.UUID
    total: int
    completed: int
    failed: int
    renders: list[RenderStatusResponse]


# ── 웹훅 ────────────────────────────────────────────────────
class HeyGenWebhookPayload(BaseModel):
    event_type: str
    event_data: HeyGenEventData


class HeyGenEventData(BaseModel):
    video_id: str = Field(..., alias="video_id")
    status: str | None = None
    url: str | None = None
    error: str | None = None
    duration: float | None = None
    callback_id: str | None = None

    model_config = {"populate_by_name": True}


# ── 비용 로그 ───────────────────────────────────────────────
class CostLogResponse(BaseModel):
    service: str
    operation: str
    cost_usd: float
    duration_seconds: float | None
    created_at: datetime


# ── 구독 플랜 ───────────────────────────────────────────────
class PlanType(str, Enum):
    FREE = "FREE"
    BASIC = "BASIC"
    PRO = "PRO"


class SubscriptionResponse(BaseModel):
    user_id: uuid.UUID
    plan: PlanType
    monthly_limit: int
    started_at: datetime
    expires_at: datetime | None


class SubscriptionCreateRequest(BaseModel):
    user_id: uuid.UUID
    plan: PlanType = Field(default=PlanType.FREE)


class SubscriptionUpdateRequest(BaseModel):
    plan: PlanType


class UsageResponse(BaseModel):
    user_id: uuid.UUID
    plan: PlanType
    monthly_limit: int
    used: int
    remaining: int
    period: str = Field(description="집계 기간 (YYYY-MM)")


class PlanLimitExceededResponse(BaseModel):
    error: str = "PLAN_LIMIT_EXCEEDED"
    detail: str
    plan: str
    monthly_limit: int
    used: int


# ── 집중 경고 ───────────────────────────────────────────────
WARNING_MESSAGES: dict[int, str] = {
    1: "집중해 주세요! 🙏",
    2: "대면 수업 때 혼나요! 😅",
    3: "이러면 점수 드릴 수가 없어요 😢",
}


class AttentionSessionStartRequest(BaseModel):
    session_id: uuid.UUID
    user_id: uuid.UUID
    lecture_id: uuid.UUID


class HeartbeatRequest(BaseModel):
    session_id: uuid.UUID
    progress_seconds: int = Field(ge=0, description="현재 시청 위치 (초)")
    is_network_unstable: bool = Field(default=False, description="네트워크 불안정 여부")


class NoResponseEvent(BaseModel):
    session_id: uuid.UUID


class WarningResponse(BaseModel):
    session_id: uuid.UUID
    warning_level: int = Field(ge=0, le=3)
    message: str | None = None
    should_pause: bool = False
    no_response_cnt: int


class SessionStatusResponse(BaseModel):
    session_id: uuid.UUID
    user_id: uuid.UUID
    lecture_id: uuid.UUID
    warning_level: int
    no_response_cnt: int
    is_paused: bool
    is_network_unstable: bool
    progress_seconds: int
    total_pause_seconds: int
    last_heartbeat_at: datetime | None


class ResumeRequest(BaseModel):
    session_id: uuid.UUID


class ResumeResponse(BaseModel):
    session_id: uuid.UUID
    warning_level: int
    is_paused: bool
    message: str = "영상이 재개되었습니다."


# Forward reference 해결
RenderRequest.model_rebuild()
