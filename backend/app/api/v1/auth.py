import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import GOOGLE_AUTH_URL, create_temp_token, decode_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.auth import (
    AccessTokenOnlyResponse,
    CompleteProfileRequest,
    ExchangeRequest,
    LogoutRequest,
    RefreshRequest,
    TempExchangeRequest,
    TempExchangeResponse,
    TokenResponse,
)
from app.services.auth import (
    consume_auth_code,
    consume_temp_code,
    create_user_from_google,
    exchange_google_code,
    get_user_by_google_sub,
    issue_tokens,
    pop_oauth_state,
    refresh_access_token,
    save_auth_code,
    save_oauth_state,
    save_temp_code,
    validate_and_delete_refresh_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GOOGLE_SCOPES = "openid email profile"
_BL_PREFIX = "bl:"

_optional_bearer = HTTPBearer(auto_error=False)


# ── Refresh Token Cookie ──────────────────────────────────────────────────────
# httpOnly + Secure(prod) + SameSite=Lax 쿠키로 refresh_token 을 내려보낸다.
# Path=/api/auth 로 한정하여 다른 API 경로 요청에 동봉되지 않게 한다.
# example.com / api.example.com 구조에서 Lax 는 same-site 로 인식되어
# axios 의 same-site XHR 에 자동 첨부된다.

REFRESH_COOKIE_NAME = "ifl_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
    )


def _to_access_only(tokens: TokenResponse, response: Response) -> AccessTokenOnlyResponse:
    """TokenResponse → 쿠키 set 후 access 만 body 로 반환."""
    _set_refresh_cookie(response, tokens.refresh_token)
    return AccessTokenOnlyResponse(access_token=tokens.access_token)


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

    토큰을 URL로 노출하지 않기 위해 1회용 교환 코드만 프론트로 전달합니다
    (nginx access_log·브라우저 히스토리·Referer 유출 방지). 프론트는 별도
    POST 엔드포인트로 코드를 토큰과 교환합니다.

    - **기존 유저**: 프론트엔드 `/auth/callback?code=...` 로 리다이렉트
    - **신규 유저**: 프론트엔드 `/auth/complete-profile?temp_code=...` 로 리다이렉트
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
        auth_code = str(uuid.uuid4())
        await save_auth_code(auth_code, str(existing_user.id), existing_user.role.value)
        return RedirectResponse(f"{frontend}/auth/callback?code={auth_code}")

    # 신규 유저: 추가 정보 입력 필요
    temp_token = create_temp_token(google_sub, email, name, role_str)
    temp_code = str(uuid.uuid4())
    await save_temp_code(temp_code, temp_token, email, name, role_str)
    return RedirectResponse(f"{frontend}/auth/complete-profile?temp_code={temp_code}")


# ── 2-1. OAuth Code 교환 (기존 유저 → access/refresh) ────────────────────────

@router.post(
    "/exchange",
    response_model=AccessTokenOnlyResponse,
    summary="OAuth 1회용 code → access 토큰 교환 (refresh 는 httpOnly 쿠키로 전달)",
)
async def exchange_oauth_code(
    body: ExchangeRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    `/google/callback`이 발급한 1회용 code를 access/refresh 토큰 쌍으로 교환합니다.
    code는 Redis getdel로 즉시 소비되며, 재사용·미존재·TTL 경과 시 401을 반환합니다.

    refresh_token 은 httpOnly 쿠키 `ifl_refresh` 로 내려가고 응답 body 에는 포함되지 않습니다.
    """
    consumed = await consume_auth_code(body.code)
    if not consumed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 code입니다.",
        )
    user_id, _role = consumed

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 code입니다.",
        )

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="존재하지 않거나 비활성화된 유저입니다.",
        )

    tokens = await issue_tokens(user)
    return _to_access_only(tokens, response)


# ── 2-2. Temp Code 교환 (신규 유저 → temp_token + 표시 메타) ───────────────────

@router.post(
    "/temp-exchange",
    response_model=TempExchangeResponse,
    summary="OAuth 1회용 temp_code → temp_token 교환",
)
async def exchange_temp_code(body: TempExchangeRequest):
    """
    `/google/callback`이 신규 유저에 대해 발급한 1회용 temp_code를
    temp_token 및 폼 표시용 메타데이터(email/name/role)로 교환합니다.
    재사용·미존재·TTL 경과 시 401.
    """
    payload = await consume_temp_code(body.temp_code)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 temp_code입니다.",
        )
    return TempExchangeResponse(**payload)


# ── 3. 프로필 완성 (신규 유저 전용) ──────────────────────────────────────────

@router.post(
    "/complete-profile",
    response_model=AccessTokenOnlyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="신규 유저 추가 정보 입력 후 가입 완료",
)
async def complete_profile(
    body: CompleteProfileRequest,
    response: Response,
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
    tokens = await issue_tokens(user)
    return _to_access_only(tokens, response)


# ── 4. Access Token 갱신 ──────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=AccessTokenOnlyResponse,
    summary="Access Token 갱신 (refresh 는 ifl_refresh 쿠키)",
)
async def refresh(
    response: Response,
    body: RefreshRequest | None = Body(default=None),
    ifl_refresh: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    `ifl_refresh` 쿠키의 refresh_token 으로 새 access/refresh 쌍을 발급합니다.
    Token Rotation: 기존 refresh 는 즉시 무효화되고 새 refresh 가 같은 쿠키로 다시 내려갑니다.

    하위 호환을 위해 body 의 `refresh_token` 도 허용합니다 (쿠키 우선).
    """
    refresh_token = ifl_refresh or (body.refresh_token if body else None)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh_token 이 없습니다.",
        )
    try:
        tokens = await refresh_access_token(db, refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return _to_access_only(tokens, response)


# ── 5. 로그아웃 ───────────────────────────────────────────────────────────────

@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="로그아웃")
async def logout(
    response: Response,
    body: LogoutRequest | None = Body(default=None),
    ifl_refresh: str | None = Cookie(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """
    Refresh Token을 Redis에서 즉시 삭제하고 ifl_refresh 쿠키를 만료 처리합니다.
    Authorization 헤더의 Access Token은 Redis 블랙리스트에 등록됩니다.
    refresh_token 은 쿠키 우선, 없으면 body 에서 읽습니다.
    """
    # Access Token 블랙리스트 등록
    if credentials:
        try:
            at_payload = decode_token(credentials.credentials)
            if at_payload.get("type") == "access":
                jti: str = at_payload["jti"]
                exp: int = at_payload["exp"]
                now = int(datetime.now(timezone.utc).timestamp())
                ttl = max(1, exp - now)
                r = get_redis()
                await r.setex(f"{_BL_PREFIX}{jti}", ttl, "1")
        except JWTError:
            pass  # 만료된 access token이어도 로그아웃 진행

    # 쿠키는 항상 만료 처리
    _clear_refresh_cookie(response)

    refresh_token = ifl_refresh or (body.refresh_token if body else None)
    if not refresh_token:
        return

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        return

    if payload.get("type") == "refresh":
        await validate_and_delete_refresh_token(payload["jti"], payload["sub"])
