import logging
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
from app.services.invite import consume_invite, validate_invite

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GOOGLE_SCOPES = "openid email profile"
_BL_PREFIX = "bl:"

_optional_bearer = HTTPBearer(auto_error=False)


# ── Refresh Token Cookie ──────────────────────────────────────────────────────
# httpOnly refresh 쿠키를 Path=/api/auth 로 한정해 내려보낸다.
#
# SameSite 정책 (사용자 결정 2026-05-19, 실측 근거):
#   프런트(classauto.live)와 API(api.classauto.live)는 별도 오리진이라
#   /api/auth/exchange · /api/auth/refresh 는 모두 "cross-origin credentialed
#   XHR" 다. SameSite=Lax 로 내려보내면 Chrome 이 이 응답의 Set-Cookie 를
#   저장하지 않아(브라우저에 api.classauto.live 쿠키가 0개로 확인됨) 15분 뒤
#   access 만료 시 refresh 가 쿠키 없이 401 → 강제 로그아웃되는 버그가 있었다.
#   교차 출처 credentialed 요청에서 안정적으로 저장·전송되려면
#   SameSite=None + Secure 가 필요하다(SameSite=None 은 Secure 필수). CORS 는
#   이미 allow_credentials=True + 정확한 origin 이라 호환된다.
#   로컬 dev(http://localhost)에서는 Secure 쿠키가 안 박히므로 Lax 로 둔다.

REFRESH_COOKIE_NAME = "ifl_refresh"
REFRESH_COOKIE_PATH = "/api/auth"

_IS_PROD = settings.ENVIRONMENT == "production"
# 프로덕션: 교차 출처 XHR 저장 보장 위해 None+Secure. dev: localhost http 대응 Lax.
_REFRESH_COOKIE_SAMESITE = "none" if _IS_PROD else "lax"
_REFRESH_COOKIE_SECURE = _IS_PROD  # SameSite=None 은 Secure 필수


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=_REFRESH_COOKIE_SECURE,
        samesite=_REFRESH_COOKIE_SAMESITE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=_REFRESH_COOKIE_SECURE,
        samesite=_REFRESH_COOKIE_SAMESITE,
    )


def _to_access_only(tokens: TokenResponse, response: Response) -> AccessTokenOnlyResponse:
    """TokenResponse → 쿠키 set 후 access 만 body 로 반환."""
    _set_refresh_cookie(response, tokens.refresh_token)
    return AccessTokenOnlyResponse(access_token=tokens.access_token)


# ── 1. Google OAuth 시작 ──────────────────────────────────────────────────────

@router.get("/google", summary="Google OAuth 로그인 시작")
async def google_login(
    role: Literal["professor", "student"] = Query(..., description="가입 역할"),
    invite: str | None = Query(
        None, description="교수자 가입 초대 토큰(신규 교수자 가입 시 필수)"
    ),
):
    """
    Google 인증 페이지로 리다이렉트합니다.
    state에 UUID를 생성하여 Redis에 role(및 교수자 초대 토큰)과 함께 저장합니다 (CSRF 방지).
    """
    state = str(uuid.uuid4())
    await save_oauth_state(state, role, invite)

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

    state_data = await pop_oauth_state(state)
    if not state_data or not state_data.get("role"):
        return RedirectResponse(f"{frontend}/auth/login?error=invalid_state")
    role_str: str = state_data["role"]
    invite_token: str | None = state_data.get("invite")

    try:
        userinfo = await exchange_google_code(code)
    except Exception:
        return RedirectResponse(f"{frontend}/auth/login?error=google_failed")

    google_sub: str = userinfo["id"]
    email: str = userinfo["email"]
    name: str = userinfo.get("name", email.split("@")[0])

    is_owner = (email or "").strip().lower() in settings.admin_email_set
    existing_user = await get_user_by_google_sub(db, google_sub)
    if existing_user:
        # 계정주(ADMIN_EMAILS)는 항상 교수자로 운영한다. 학습자로 잘못 가입돼 있어도
        # 교수자 로그인을 막지 않고 역할을 교수자로 자가 교정한다 — 운영자가 베타 초대
        # 발급 등 교수자 화면(/owner/invites 포함)에 들어갈 수 있어야 하기 때문.
        if is_owner and existing_user.role == UserRole.student:
            existing_user.role = UserRole.professor
            await db.commit()
            await db.refresh(existing_user)
        # 위험 방향 차단: (계정주가 아닌) 학습자 계정이 '교수자'로 로그인을 시도하면
        # 거부한다. (반대 방향 — 교수자가 '학습자' 선택 — 은 권한 상승이 아니므로 허용하고
        #  실제 역할인 교수자로 로그인된다.) 기존 계정은 가입 시 역할이 권위 있다.
        elif existing_user.role == UserRole.student and role_str == "professor":
            return RedirectResponse(f"{frontend}/auth/login?error=role_denied")
        auth_code = str(uuid.uuid4())
        await save_auth_code(auth_code, str(existing_user.id), existing_user.role.value)
        return RedirectResponse(f"{frontend}/auth/callback?code={auth_code}")

    # 신규 유저 — 교수자 가입은 베타 게이트: 계정주가 그 이메일로 발급한 유효한
    # 초대가 있어야 한다. 학습자 가입은 게이트 없음(강의 링크로 자유 가입).
    if role_str == "professor":
        invite = await validate_invite(db, invite_token, email)
        if invite is None:
            return RedirectResponse(f"{frontend}/auth/login?error=invalid_invite")

    # 추가 정보 입력 필요. 교수자면 초대 토큰을 temp_token 에 실어 프로필
    # 완성 단계에서 재검증·소비한다(temp_token 재사용 방어).
    temp_token = create_temp_token(
        google_sub, email, name, role_str, invite=invite_token
    )
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

    **R2W2 추가 (BACKEND_ASKS.W4 #3)**: 학생 회원가입 폼이 OAuth 라운드트립 전에
    수집한 옵션 힌트 — `name` / `locale` 도 옵셔널로 수용한다. 모두 빈 값이면
    무시되고 기존 호출자 동작이 그대로 유지된다 (PATCH 의미).

    - `name`: 비어있지 않으면 Google 의 표시명을 덮어써 ``user.name`` 으로 저장.
    - `locale`: ``ko`` / ``en`` — User 모델에 컬럼이 없어 현재는 로깅만 (추후
      ``users.locale`` 컬럼이 추가되면 자동 채움).
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

    invite = None
    if role_str == "professor":
        if not body.school or not body.department:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="교수자는 school과 department가 필수입니다.",
            )
        # 베타 게이트 재검증 — temp_token 에 실린 초대 토큰을 이메일과 함께
        # 다시 확인한다(콜백 통과 후 temp_token 재사용·만료를 방어). 유효한
        # 초대가 없으면 가입 거부. 학습자는 이 게이트와 무관.
        invite = await validate_invite(db, payload.get("invite"), payload["email"])
        if invite is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="유효하지 않거나 만료된 교수자 초대입니다.",
            )
        # G: 베타 모니터링 동의 필수(교수자 한정). 미동의면 가입 거부.
        # 학생 흐름은 이 게이트와 무관(아래 student 분기 불변).
        if not body.beta_consented:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="베타 모니터링 약관에 동의해야 가입할 수 있습니다.",
            )
    elif role_str == "student":
        if not body.student_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="학습자는 student_number가 필수입니다.",
            )

    # R2W2: 폼에서 입력한 표시명이 있으면 Google 의 name 을 덮어쓴다.
    # CompleteProfileRequest 의 _empty_string_to_none 가 공백/빈 문자열을 None
    # 으로 정규화해두어 ``body.name`` 이 truthy 면 곧 사용자 의도 입력이다.
    final_name = body.name or payload["name"]

    if body.locale:
        # users.locale 컬럼이 추가되면 ``create_user_from_google`` 인자로 추가.
        # 그 전까지는 분석/디버깅 목적으로 로그에만 남긴다.
        logger.info(
            "complete_profile locale hint accepted (no column yet): role=%s, locale=%s",
            role_str, body.locale,
        )

    # G: 교수자는 초대의 cohort 를 복사받고 동의 시각을 기록한다(학생은 둘 다 None).
    cohort = invite.cohort if invite is not None else None
    beta_consented_at = (
        datetime.now(timezone.utc)
        if (invite is not None and body.beta_consented)
        else None
    )

    user = await create_user_from_google(
        db=db,
        google_sub=payload["sub"],
        email=payload["email"],
        name=final_name,
        role=UserRole(role_str),
        school=body.school,
        department=body.department,
        student_number=body.student_number,
        cohort=cohort,
        beta_consented_at=beta_consented_at,
    )
    # 교수자 가입 성공 — 초대를 단일 사용 처리(이후 동일 링크 재사용 차단).
    if invite is not None:
        await consume_invite(db, invite, user.id)
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
