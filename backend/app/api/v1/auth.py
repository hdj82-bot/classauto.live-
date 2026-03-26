import uuid
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import GOOGLE_AUTH_URL, create_temp_token, decode_token
from app.db.session import get_db
from app.models.user import UserRole
from app.schemas.auth import (
    CompleteProfileRequest,
    LogoutRequest,
    NeedsProfileResponse,
    RefreshRequest,
    TokenResponse,
)
from app.services.auth import (
    create_user_from_google,
    exchange_google_code,
    get_user_by_google_sub,
    issue_tokens,
    pop_oauth_state,
    refresh_access_token,
    save_oauth_state,
    validate_and_delete_refresh_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GOOGLE_SCOPES = "openid email profile"


# ── 1. Google OAuth 시작 ──────────────────────────────────────────────────────

@router.get("/google", summary="Google OAuth 로그인 시작")
async def google_login(
    role: Literal["professor", "student"] = Query(..., description="가입 역할"),
):
    """
    Google 인증 페이지로 리다이렉트합니다.
    state에 UUID를 생성하여 Redis에 role과 함께 저장합니다 (CSRF 방지).
    """
    state = str(uuid.uuid4())
    await save_oauth_state(state, role)

    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": _GOOGLE_SCOPES,
        "access_type": "offline",
        "state": state,
        "prompt": "select_account",
    }
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


# ── 2. Google OAuth 콜백 ──────────────────────────────────────────────────────

@router.get("/google/callback", summary="Google OAuth 콜백")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Google에서 Authorization Code와 state를 받아 처리합니다.

    - **기존 유저**: 프론트엔드 `/auth/callback?access_token=...&refresh_token=...` 로 리다이렉트
    - **신규 유저**: 프론트엔드 `/auth/complete-profile?temp_token=...&email=...&name=...&role=...` 로 리다이렉트
    """
    frontend = settings.FRONTEND_URL

    role_str = await pop_oauth_state(state)
    if not role_str:
        return RedirectResponse(f"{frontend}/auth/login?error=invalid_state")

    try:
        userinfo = await exchange_google_code(code)
    except Exception:
        return RedirectResponse(f"{frontend}/auth/login?error=google_failed")

    google_sub: str = userinfo["id"]
    email: str = userinfo["email"]
    name: str = userinfo.get("name", email.split("@")[0])

    existing_user = await get_user_by_google_sub(db, google_sub)
    if existing_user:
        tokens = await issue_tokens(existing_user)
        params = urlencode({
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
        })
        return RedirectResponse(f"{frontend}/auth/callback?{params}")

    # 신규 유저: 추가 정보 입력 필요
    temp_token = create_temp_token(google_sub, email, name, role_str)
    params = urlencode({
        "temp_token": temp_token,
        "email": email,
        "name": name,
        "role": role_str,
    })
    return RedirectResponse(f"{frontend}/auth/complete-profile?{params}")


# ── 3. 프로필 완성 (신규 유저 전용) ──────────────────────────────────────────

@router.post(
    "/complete-profile",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="신규 유저 추가 정보 입력 후 가입 완료",
)
async def complete_profile(
    body: CompleteProfileRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    temp_token을 검증하고 역할별 추가 정보를 저장하여 유저를 생성합니다.

    - **교수자**: `school`, `department` 필수
    - **학습자**: `student_number` 필수
    """
    try:
        payload = decode_token(body.temp_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 임시 토큰입니다.",
        )

    if payload.get("type") != "temp":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="임시 토큰이 아닙니다.",
        )

    role_str: str = payload["role"]

    if role_str == "professor":
        if not body.school or not body.department:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="교수자는 school과 department가 필수입니다.",
            )
    elif role_str == "student":
        if not body.student_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="학습자는 student_number가 필수입니다.",
            )

    user = await create_user_from_google(
        db=db,
        google_sub=payload["sub"],
        email=payload["email"],
        name=payload["name"],
        role=UserRole(role_str),
        school=body.school,
        department=body.department,
        student_number=body.student_number,
    )
    return await issue_tokens(user)


# ── 4. Access Token 갱신 ──────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse, summary="Access Token 갱신")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """
    유효한 Refresh Token으로 새로운 Access/Refresh Token 쌍을 발급합니다.
    기존 Refresh Token은 즉시 무효화됩니다 (Token Rotation).
    """
    try:
        return await refresh_access_token(db, body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


# ── 5. 로그아웃 ───────────────────────────────────────────────────────────────

@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="로그아웃")
async def logout(body: LogoutRequest):
    """
    Refresh Token을 Redis에서 즉시 삭제합니다.
    Access Token은 만료(15분)까지 유효하므로 프론트엔드에서 폐기해야 합니다.
    """
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        # 이미 만료된 토큰이어도 로그아웃 성공으로 처리
        return

    if payload.get("type") == "refresh":
        await validate_and_delete_refresh_token(payload["jti"], payload["sub"])
