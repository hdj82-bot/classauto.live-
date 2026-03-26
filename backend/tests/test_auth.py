"""인증 API 통합 테스트.

실제 Google OAuth 호출 없이 토큰 발급·갱신·로그아웃만 검증한다.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import create_refresh_token
from tests.conftest import make_auth_header


# ── GET /api/auth/google ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_login_redirect(client, fake_redis):
    """로그인 요청 시 Google OAuth URL로 리다이렉트."""
    resp = await client.get(
        "/api/auth/google",
        params={"role": "student"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "accounts.google.com" in resp.headers["location"]


@pytest.mark.asyncio
async def test_google_login_invalid_role(client):
    """잘못된 role 파라미터는 422."""
    resp = await client.get(
        "/api/auth/google",
        params={"role": "unknown"},
        follow_redirects=False,
    )
    assert resp.status_code == 422


# ── POST /api/auth/refresh ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token_success(client, fake_redis, professor):
    """유효한 Refresh Token으로 Access Token 재발급."""
    refresh_token, jti = create_refresh_token(str(professor.id), professor.role.value)
    # Redis에 jti 저장 (정상 발급 상태 시뮬레이션)
    await fake_redis.set(f"rt:{jti}", str(professor.id))

    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_refresh_token_invalid(client):
    """위조된 Refresh Token은 401."""
    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": "this.is.fake"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_not_in_redis(client, professor):
    """Redis에 없는 jti(사용 완료 또는 로그아웃된 토큰)는 401."""
    refresh_token, _ = create_refresh_token(str(professor.id), professor.role.value)
    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 401


# ── DELETE /api/auth/logout ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_success(client, fake_redis, professor):
    """로그아웃 시 Refresh Token 무효화."""
    refresh_token, jti = create_refresh_token(str(professor.id), professor.role.value)
    await fake_redis.set(f"rt:{jti}", str(professor.id))

    resp = await client.delete(
        "/api/auth/logout",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 204
    # Redis에서 삭제 확인
    assert await fake_redis.get(f"rt:{jti}") is None


@pytest.mark.asyncio
async def test_logout_invalid_token(client):
    """위조된 토큰 로그아웃 → 401."""
    resp = await client.delete(
        "/api/auth/logout",
        json={"refresh_token": "invalid.token.here"},
    )
    assert resp.status_code == 401


# ── 인증 없는 보호 엔드포인트 ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_protected_without_token(client):
    """인증 헤더 없이 보호된 엔드포인트 접근 → 403 or 401."""
    resp = await client.get("/api/courses")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_protected_with_invalid_token(client):
    """위조된 Bearer 토큰 → 401."""
    resp = await client.get(
        "/api/courses",
        headers={"Authorization": "Bearer totally.fake.token"},
    )
    assert resp.status_code == 401
