import re
from datetime import datetime

from pydantic import BaseModel, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InviteCreateRequest(BaseModel):
    """운영자가 교수자 초대 링크를 발급할 때 — 대상 이메일."""

    email: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("올바른 이메일 형식이 아닙니다.")
        return v


class InviteResponse(BaseModel):
    """운영자 발급 화면용 — 링크와 상태 포함."""

    id: str
    token: str
    email: str
    role: str
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
