import re
from datetime import datetime

from pydantic import BaseModel, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InviteCreateRequest(BaseModel):
    """운영자가 교수자 초대 링크를 발급할 때 — 대상 이메일 + 코호트(선택)."""

    email: str
    # 베타 코호트 태그(예: "2026-08"). 없으면 NULL — 가입한 교수자 cohort 로 전파.
    cohort: str | None = None

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("올바른 이메일 형식이 아닙니다.")
        return v

    @field_validator("cohort", mode="before")
    @classmethod
    def _normalize_cohort(cls, v):
        """공백/빈 문자열은 미지정(None)으로."""
        if isinstance(v, str):
            stripped = v.strip()
            return stripped if stripped else None
        return v


class InviteResponse(BaseModel):
    """운영자 발급 화면용 — 링크와 상태 포함."""

    id: str
    token: str
    email: str
    role: str
    cohort: str | None = None
    status: str  # active | used | expired
    invite_url: str
    created_at: datetime
    expires_at: datetime | None = None
    used_at: datetime | None = None


class InvitePublicInfo(BaseModel):
    """초대 랜딩 페이지가 보여줄 최소 정보 (토큰 보유자에게만)."""

    email: str
    role: str
    status: str  # active | used | expired
