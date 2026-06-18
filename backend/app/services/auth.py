import json
import uuid
from datetime import datetime, timedelta

import httpx
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import (
    GOOGLE_TOKEN_URL,
    GOOGLE_USERINFO_URL,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User, UserRole
from app.schemas.auth import TokenResponse

_RT_PREFIX = "rt:"
_STATE_PREFIX = "oauth_state:"
_AUTHCODE_PREFIX = "authcode:"
_TEMPCODE_PREFIX = "tempcode:"
_AUTHCODE_TTL = 60
_TEMPCODE_TTL = 60


# ── Redis: Refresh Token ──────────────────────────────────────────────────────

async def save_refresh_token(jti: str, user_id: str) -> None:
    r = get_redis()
    ttl = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    await r.setex(f"{_RT_PREFIX}{jti}", ttl, user_id)


async def validate_and_delete_refresh_token(jti: str, user_id: str) -> bool:
    """Redis에서 jti를 확인하고 삭제. 유효하면 True 반환."""
    r = get_redis()
    stored = await r.getdel(f"{_RT_PREFIX}{jti}")
    return stored == user_id


# ── Redis: OAuth State ────────────────────────────────────────────────────────

async def save_oauth_state(
    state: str, role: str, invite: str | None = None
) -> None:
    r = get_redis()
    # role 과 (교수자 초대 시) invite 토큰을 함께 보관. 과거엔 role 문자열만
    # 저장했으나, 가입 게이트를 위해 JSON 으로 확장(콜백에서 둘 다 복원).
    payload = json.dumps({"role": role, "invite": invite})
    await r.setex(f"{_STATE_PREFIX}{state}", 600, payload)  # 10분 TTL


async def pop_oauth_state(state: str) -> dict | None:
    """state를 읽고 즉시 삭제(재사용 방지). {"role", "invite"} dict 반환.

    하위호환: 과거 형식(역할 문자열만 저장)도 dict 로 정규화한다.
    """
    r = get_redis()
    raw = await r.getdel(f"{_STATE_PREFIX}{state}")
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "role" in data:
            return {"role": data.get("role"), "invite": data.get("invite")}
    except (TypeError, ValueError):
        pass
    # 구형: 역할 문자열만 저장돼 있던 경우.
    return {"role": raw, "invite": None}


# ── Redis: OAuth Auth Code (1회용) ────────────────────────────────────────────

async def save_auth_code(code: str, user_id: str, role: str) -> None:
    """기존 유저용 1회성 교환 코드. value=`{user_id}:{role}`, TTL 60초."""
    r = get_redis()
    await r.setex(f"{_AUTHCODE_PREFIX}{code}", _AUTHCODE_TTL, f"{user_id}:{role}")


async def consume_auth_code(code: str) -> tuple[str, str] | None:
    """code를 getdel로 1회 소비. 미존재/소비완료 시 None."""
    r = get_redis()
    raw = await r.getdel(f"{_AUTHCODE_PREFIX}{code}")
    if not raw:
        return None
    user_id, _, role = raw.partition(":")
    if not user_id or not role:
        return None
    return user_id, role


# ── Redis: Temp Code (신규 유저 추가 정보 입력용) ──────────────────────────────

async def save_temp_code(
    temp_code: str,
    temp_token: str,
    email: str,
    name: str,
    role: str,
) -> None:
    """신규 유저용 1회성 교환 코드. temp_token과 표시용 메타데이터를 묶어 저장. TTL 60초."""
    r = get_redis()
    payload = json.dumps(
        {"temp_token": temp_token, "email": email, "name": name, "role": role}
    )
    await r.setex(f"{_TEMPCODE_PREFIX}{temp_code}", _TEMPCODE_TTL, payload)


async def consume_temp_code(temp_code: str) -> dict | None:
    """temp_code를 getdel로 1회 소비. 미존재/소비완료/포맷오류 시 None."""
    r = get_redis()
    raw = await r.getdel(f"{_TEMPCODE_PREFIX}{temp_code}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


# ── Google OAuth ──────────────────────────────────────────────────────────────

async def exchange_google_code(code: str) -> dict:
    """Authorization Code → Google UserInfo 딕셔너리 반환."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("Google token response에 access_token이 없습니다.")

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

        # 필수 필드 검증
        if not userinfo.get("id") or not userinfo.get("email"):
            raise ValueError("Google userinfo에 필수 필드(id, email)가 없습니다.")

        return userinfo


# ── 토큰 발급 ─────────────────────────────────────────────────────────────────

async def issue_tokens(user: User) -> TokenResponse:
    user_id = str(user.id)
    access = create_access_token(user_id, user.role.value)
    refresh, jti = create_refresh_token(user_id, user.role.value)
    await save_refresh_token(jti, user_id)
    return TokenResponse(access_token=access, refresh_token=refresh)


# ── 유저 조회 / 생성 ──────────────────────────────────────────────────────────

async def get_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    result = await db.execute(select(User).where(User.google_sub == google_sub))
    return result.scalar_one_or_none()


async def create_user_from_google(
    db: AsyncSession,
    google_sub: str,
    email: str,
    name: str,
    role: UserRole,
    school: str | None = None,
    department: str | None = None,
    student_number: str | None = None,
    cohort: str | None = None,
    beta_consented_at: datetime | None = None,
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        google_sub=google_sub,
        role=role,
        school=school,
        department=department,
        student_number=student_number,
        cohort=cohort,
        beta_consented_at=beta_consented_at,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── Refresh Token 검증 ────────────────────────────────────────────────────────

async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise ValueError("유효하지 않은 Refresh Token입니다.")

    if payload.get("type") != "refresh":
        raise ValueError("토큰 타입이 올바르지 않습니다.")

    user_id: str = payload["sub"]
    jti: str = payload["jti"]

    valid = await validate_and_delete_refresh_token(jti, user_id)
    if not valid:
        raise ValueError("만료되었거나 이미 사용된 Refresh Token입니다.")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise ValueError("존재하지 않거나 비활성화된 유저입니다.")

    return await issue_tokens(user)
