from typing import Literal
from pydantic import BaseModel


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenOnlyResponse(BaseModel):
    """Refresh token 은 httpOnly 쿠키로 내려가고 응답 body 에서 제외."""
    access_token: str
    token_type: str = "bearer"


class NeedsProfileResponse(BaseModel):
    needs_profile: bool = True
    temp_token: str
    email: str
    name: str
    role: Literal["professor", "student"]


class ProfessorProfileIn(BaseModel):
    school: str
    department: str


class StudentProfileIn(BaseModel):
    student_number: str


class CompleteProfileRequest(BaseModel):
    temp_token: str
    # 교수자 전용
    school: str | None = None
    department: str | None = None
    # 학습자 전용
    student_number: str | None = None


class RefreshRequest(BaseModel):
    """레거시 body refresh — 쿠키 미설정 클라이언트(예: 모바일) 호환용."""
    refresh_token: str | None = None


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class ExchangeRequest(BaseModel):
    code: str


class TempExchangeRequest(BaseModel):
    temp_code: str


class TempExchangeResponse(BaseModel):
    temp_token: str
    email: str
    name: str
    role: Literal["professor", "student"]
