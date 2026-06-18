"""인앱 피드백 스키마."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_ALLOWED_CATEGORIES = {"bug", "idea", "confusing", "other"}
_ALLOWED_STATUSES = {"open", "triaged", "resolved"}


class FeedbackCreateRequest(BaseModel):
    """교수/학생이 제출하는 피드백."""

    category: str = Field(default="other")
    message: str = Field(min_length=1, max_length=4000)
    lecture_id: uuid.UUID | None = None
    page: str | None = Field(default=None, max_length=255)

    @field_validator("category")
    @classmethod
    def _valid_category(cls, v: str) -> str:
        v = (v or "other").strip().lower()
        if v not in _ALLOWED_CATEGORIES:
            raise ValueError(
                f"category 는 {sorted(_ALLOWED_CATEGORIES)} 중 하나여야 합니다."
            )
        return v


class FeedbackStatusUpdateRequest(BaseModel):
    """운영자가 피드백 상태를 변경할 때."""

    status: str

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in _ALLOWED_STATUSES:
            raise ValueError(
                f"status 는 {sorted(_ALLOWED_STATUSES)} 중 하나여야 합니다."
            )
        return v


class FeedbackResponse(BaseModel):
    id: str
    user_id: str | None = None
    user_email: str | None = None
    role: str
    category: str
    message: str
    lecture_id: str | None = None
    page: str | None = None
    status: str
    created_at: datetime
