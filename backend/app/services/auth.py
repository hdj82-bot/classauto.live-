import uuid
from datetime import timedelta

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

async def save_oauth_state(state: str, role: str) -> None:
    r = get_redis()
    await r.setex(f"{_STATE_PREFIX}{state}", 600, role)  # 10분 TTL


async def pop_oauth_state(state: str) -> str | None:
    """state를 읽고 즉시 삭제 (재사용 방지)."""
    r = get_redis()
    return await r.getdel(f"{_STATE_PREFIX}{state}")


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
