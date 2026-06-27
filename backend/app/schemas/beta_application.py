"""베타 신청 스키마 (대문 '베타 신청하기' 폼)."""
import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ALLOWED_TIMINGS = {"now", "nextSemester", "undecided"}
_ALLOWED_CHANNELS = {"referral", "conference", "search", "other"}
_ALLOWED_STATUSES = {"new", "contacted", "approved", "rejected"}


class BetaApplicationCreateRequest(BaseModel):
    """비로그인 방문자가 제출하는 베타 신청(공개 엔드포인트)."""

    name: str = Field(min_length=1, max_length=120)
    school: str = Field(min_length=1, max_length=200)
    department: str = Field(min_length=1, max_length=200)
    professor_title: str = Field(min_length=1, max_length=80)
    email: str
    subject: str = Field(min_length=1, max_length=200)
    student_count: str | None = Field(default=None, max_length=40)
    start_timing: str
    channel: str
    message: str | None = Field(default=None, max_length=4000)

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("올바른 이메일 형식이 아닙니다.")
        return v

    @field_validator("start_timing")
    @classmethod
    def _valid_timing(cls, v: str) -> str:
        if v not in _ALLOWED_TIMINGS:
            raise ValueError(f"start_timing 은 {sorted(_ALLOWED_TIMINGS)} 중 하나여야 합니다.")
        return v

    @field_validator("channel")
    @classmethod
    def _valid_channel(cls, v: str) -> str:
        if v not in _ALLOWED_CHANNELS:
            raise ValueError(f"channel 은 {sorted(_ALLOWED_CHANNELS)} 중 하나여야 합니다.")
        return v


class BetaApplicationStatusUpdateRequest(BaseModel):
    """운영자가 신청 상태를 변경할 때."""

    status: str

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in _ALLOWED_STATUSES:
            raise ValueError(f"status 는 {sorted(_ALLOWED_STATUSES)} 중 하나여야 합니다.")
        return v


class BetaApplicationResponse(BaseModel):
    id: str
    name: str
    school: str
    department: str
    professor_title: str
    email: str
    subject: str
    student_count: str | None = None
    start_timing: str
    channel: str
    message: str | None = None
    status: str
    created_at: datetime
