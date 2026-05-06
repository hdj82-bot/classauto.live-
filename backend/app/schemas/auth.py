from typing import Literal
from pydantic import BaseModel, Field, field_validator


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
    """추가 정보 입력 후 가입 완료.

    BACKEND_ASKS.W4 #3: 회원가입 폼이 OAuth 라운드트립 전에 sessionStorage 로
    name / locale / student_number 를 stash 해두면 이 엔드포인트로 함께 보내
    재입력을 없앤다. 모두 Optional — 안 보내도 기존 동작 유지 (PATCH 의미).
    """

    temp_token: str

    # ── pre-OAuth 힌트 (옵셔널, R2W2 추가) ──────────────────────────────
    name: str | None = Field(
        default=None,
        max_length=100,
        description=(
            "회원가입 폼에서 입력한 표시명. 비어있지 않으면 Google 의 name 을 "
            "덮어써 user.name 으로 저장된다."
        ),
    )
    locale: Literal["ko", "en"] | None = Field(
        default=None,
        description=(
            "선호 언어 힌트. User 모델에 컬럼이 없어 현재는 로깅만 — 추후 "
            "users.locale 마이그레이션이 추가되면 자동으로 채워진다."
        ),
    )

    # ── 교수자 전용 (기존 동작 유지) ───────────────────────────────────
    school: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)

    # ── 학습자 전용 (기존 동작 유지) ───────────────────────────────────
    student_number: str | None = Field(default=None, max_length=50)

    @field_validator("name", "school", "department", "student_number", mode="before")
    @classmethod
    def _empty_string_to_none(cls, v):
        """공백/빈 문자열은 미입력으로 간주 — 기존 호출자 호환 + PATCH 의미."""
        if isinstance(v, str):
            stripped = v.strip()
            return stripped if stripped else None
        return v


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
