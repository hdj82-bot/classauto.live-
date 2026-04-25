"""인증 API 통합 테스트.

실제 Google OAuth 호출 없이 토큰 발급·갱신·로그아웃만 검증한다.
"""

import json
import uuid

import pytest

from app.core.security import create_refresh_token, create_temp_token


# ── GET /api/auth/google ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_login_redirect(client, fake_redis):
    """로그인 요청 시 Google OAuth URL로 리다이렉트."""
    resp = await client.get(
        "/api/auth/google",
        params={"role": "student"},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
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

    resp = await client.request(
        "DELETE",
        "/api/auth/logout",
        content=f'{{"refresh_token": "{refresh_token}"}}',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 204
    # Redis에서 삭제 확인
    assert await fake_redis.get(f"rt:{jti}") is None


@pytest.mark.asyncio
async def test_logout_invalid_token(client):
    """위조된 토큰 로그아웃 → 401 또는 204 (구현에 따라 다름)."""
    resp = await client.request(
        "DELETE",
        "/api/auth/logout",
        content='{"refresh_token": "invalid.token.here"}',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code in (204, 401)


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


# ── Access Token 블랙리스트 ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_blacklists_access_token(client, fake_redis, professor):
    """로그아웃 시 Authorization 헤더의 Access Token이 Redis 블랙리스트에 등록된다."""
    from app.core.security import create_access_token, decode_token

    refresh_token, jti = create_refresh_token(str(professor.id), professor.role.value)
    await fake_redis.set(f"rt:{jti}", str(professor.id))

    access_token = create_access_token(str(professor.id), professor.role.value)
    at_payload = decode_token(access_token)
    at_jti = at_payload["jti"]

    resp = await client.request(
        "DELETE",
        "/api/auth/logout",
        content=f'{{"refresh_token": "{refresh_token}"}}',
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
    )
    assert resp.status_code == 204
    assert await fake_redis.exists(f"bl:{at_jti}") == 1


# ── POST /api/auth/exchange (1회용 OAuth code → 토큰) ───────────────────────

@pytest.mark.asyncio
async def test_exchange_success(client, fake_redis, professor):
    """유효한 code로 access/refresh 토큰을 발급받는다."""
    code = str(uuid.uuid4())
    await fake_redis.setex(
        f"authcode:{code}", 60, f"{professor.id}:{professor.role.value}"
    )
    resp = await client.post("/api/auth/exchange", json={"code": code})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    # 1회용: Redis에서 즉시 소비되었는지 확인
    assert await fake_redis.get(f"authcode:{code}") is None


@pytest.mark.asyncio
async def test_exchange_reuse_returns_401(client, fake_redis, professor):
    """동일 code 재사용 시 즉시 401."""
    code = str(uuid.uuid4())
    await fake_redis.setex(
        f"authcode:{code}", 60, f"{professor.id}:{professor.role.value}"
    )
    first = await client.post("/api/auth/exchange", json={"code": code})
    assert first.status_code == 200

    second = await client.post("/api/auth/exchange", json={"code": code})
    assert second.status_code == 401


@pytest.mark.asyncio
async def test_exchange_unknown_code_returns_401(client):
    """존재하지 않는 code → 401."""
    resp = await client.post(
        "/api/auth/exchange", json={"code": "does-not-exist"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_exchange_expired_code_returns_401(client, fake_redis, professor):
    """TTL 경과(=Redis에 더이상 존재하지 않음) → 401."""
    code = str(uuid.uuid4())
    await fake_redis.setex(
        f"authcode:{code}", 60, f"{professor.id}:{professor.role.value}"
    )
    # TTL 만료 시뮬레이션: 키를 직접 삭제
    await fake_redis.delete(f"authcode:{code}")

    resp = await client.post("/api/auth/exchange", json={"code": code})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_exchange_inactive_user_returns_401(client, fake_redis, db, professor):
    """비활성화된 유저의 code → 401."""
    professor.is_active = False
    await db.flush()

    code = str(uuid.uuid4())
    await fake_redis.setex(
        f"authcode:{code}", 60, f"{professor.id}:{professor.role.value}"
    )
    resp = await client.post("/api/auth/exchange", json={"code": code})
    assert resp.status_code == 401


# ── POST /api/auth/temp-exchange (1회용 temp_code → temp_token) ──────────────

@pytest.mark.asyncio
async def test_temp_exchange_success(client, fake_redis):
    """유효한 temp_code로 temp_token + 표시 메타를 받는다."""
    temp_code = str(uuid.uuid4())
    temp_token = create_temp_token(
        google_sub="google-new-001",
        email="new@test.ac.kr",
        name="신규 유저",
        role="student",
    )
    payload = json.dumps(
        {
            "temp_token": temp_token,
            "email": "new@test.ac.kr",
            "name": "신규 유저",
            "role": "student",
        }
    )
    await fake_redis.setex(f"tempcode:{temp_code}", 60, payload)

    resp = await client.post(
        "/api/auth/temp-exchange", json={"temp_code": temp_code}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["temp_token"] == temp_token
    assert data["email"] == "new@test.ac.kr"
    assert data["role"] == "student"
    # 1회용 소비 확인
    assert await fake_redis.get(f"tempcode:{temp_code}") is None


@pytest.mark.asyncio
async def test_temp_exchange_reuse_returns_401(client, fake_redis):
    """temp_code 재사용 시 401."""
    temp_code = str(uuid.uuid4())
    payload = json.dumps(
        {
            "temp_token": "any.temp.token",
            "email": "x@y.com",
            "name": "X",
            "role": "professor",
        }
    )
    await fake_redis.setex(f"tempcode:{temp_code}", 60, payload)

    first = await client.post(
        "/api/auth/temp-exchange", json={"temp_code": temp_code}
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/auth/temp-exchange", json={"temp_code": temp_code}
    )
    assert second.status_code == 401


@pytest.mark.asyncio
async def test_temp_exchange_unknown_code_returns_401(client):
    """존재하지 않는 temp_code → 401."""
    resp = await client.post(
        "/api/auth/temp-exchange", json={"temp_code": "missing"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_blacklisted_access_token_rejected(client, fake_redis, professor):
    """블랙리스트에 등록된 Access Token으로 보호된 엔드포인트 접근 시 401 반환."""
    from app.core.security import create_access_token, decode_token

    access_token = create_access_token(str(professor.id), professor.role.value)
    at_payload = decode_token(access_token)
    at_jti = at_payload["jti"]

    # 블랙리스트에 직접 등록
    await fake_redis.setex(f"bl:{at_jti}", 900, "1")

    resp = await client.get(
        "/api/courses",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp.status_code == 401
