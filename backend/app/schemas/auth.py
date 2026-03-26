from typing import Literal
from pydantic import BaseModel, EmailStr


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
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
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str
