"""RateLimitMiddleware 보안 회귀 테스트.

검증 포인트:
1. JWT 토큰 회전(refresh) 후 새 access 토큰을 들고 와도 같은 sub 면 카운터를
   공유한다 → 토큰 회전을 통한 rate limit 우회 차단.
2. 서로 다른 사용자(sub) 는 독립된 버킷을 갖는다.
3. /api/auth/exchange 같은 1회용 OAuth 코드 교환은 IP 단위로 분당 5회로
   강하게 제한되어 무차별 대입을 차단한다.
4. 위조된 JWT(서명 무효) 는 user 식별자로 신뢰하지 않고 IP 폴백한다.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token


class _IncrFakeRedis:
    """FakeRedis 의 INCR/EXPIRE 미지원을 보완하는 단순 인메모리 mock."""

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}

    async def incr(self, key: str) -> int:
        v = int(self._store.get(key, 0)) + 1
        self._store[key] = v
        return v

    async def expire(self, key: str, seconds: int) -> None:  # noqa: ARG002
        return None

    # /api/auth 흐름이 같은 redis 객체로 다른 op 도 호출할 수 있으므로 최소 호환.
    async def set(self, key: str, value: Any, ex: int | None = None) -> None:  # noqa: ARG002
        self._store[key] = value

    async def setex(self, key: str, ttl: int, value: Any) -> None:  # noqa: ARG002
        self._store[key] = value

    async def get(self, key: str) -> Any:
        return self._store.get(key)

    async def getdel(self, key: str) -> Any:
        return self._store.pop(key, None)

    async def delete(self, key: str) -> int:
        return 1 if self._store.pop(key, None) is not None else 0

    async def exists(self, key: str) -> int:
        return 1 if key in self._store else 0


@pytest.fixture
def incr_fake_redis() -> _IncrFakeRedis:
    return _IncrFakeRedis()


@pytest_asyncio.fixture
async def rl_client(db, incr_fake_redis):
    """RateLimit 미들웨어가 _IncrFakeRedis 를 쓰도록 주입한 테스트 클라이언트."""
    from app.core import redis as redis_module
    from app.db.session import get_db
    from app.main import app

    async def override_get_db():
        yield db

    def override_get_redis():
        return incr_fake_redis

    app.dependency_overrides[get_db] = override_get_db
    redis_module.get_redis = override_get_redis

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── 1. 토큰 회전(JTI 변경)으로 카운터 우회 불가 ─────────────────────────────────


@pytest.mark.asyncio
async def test_rate_limit_key_shared_across_token_rotation(rl_client, incr_fake_redis):
    """같은 sub 의 새 access 토큰을 발급해도 rate limit 카운터를 공유해야 한다."""
    user_id = str(uuid.uuid4())

    token_a = create_access_token(user_id, "professor")
    # 새 jti, 다른 토큰 문자열이지만 sub 동일
    token_b = create_access_token(user_id, "professor")
    assert token_a != token_b

    # 둘 다 같은 user 키로 묶이는지 확인 — Redis 키 prefix 로 검사
    await rl_client.get("/api/v1/qa", headers={"Authorization": f"Bearer {token_a}"})
    await rl_client.get("/api/v1/qa", headers={"Authorization": f"Bearer {token_b}"})

    user_keys = [
        k for k in incr_fake_redis._store
        if k.startswith(f"rl:user:{user_id}:")
    ]
    # 둘 중 어느 토큰이든 동일한 키로 카운팅되어야 한다.
    assert len(user_keys) == 1, f"expected single shared bucket, got {user_keys}"
    assert incr_fake_redis._store[user_keys[0]] == 2


# ── 2. 서로 다른 사용자는 독립 버킷 ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_rate_limit_separate_bucket_per_user(rl_client, incr_fake_redis):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    token_a = create_access_token(user_a, "student")
    token_b = create_access_token(user_b, "student")

    await rl_client.get("/api/v1/qa", headers={"Authorization": f"Bearer {token_a}"})
    await rl_client.get("/api/v1/qa", headers={"Authorization": f"Bearer {token_b}"})

    keys = [k for k in incr_fake_redis._store if k.startswith("rl:user:")]
    assert len(keys) == 2
    for k in keys:
        assert incr_fake_redis._store[k] == 1


# ── 3. OAuth 1회용 코드 교환 brute-force 차단 ────────────────────────────────


@pytest.mark.asyncio
async def test_oauth_exchange_rate_limit_5_per_minute(rl_client, incr_fake_redis):
    """/api/auth/exchange 는 IP 당 분당 5회까지만 허용."""
    statuses: list[int] = []
    # 6번 시도 — 마지막 한 번은 429
    for _ in range(6):
        r = await rl_client.post("/api/auth/exchange", json={"code": "00000000-0000-0000-0000-000000000000"})
        statuses.append(r.status_code)

    # 401(잘못된 code) 또는 200 으로 응답이 오다가 6번째에 429 가 나와야 한다.
    assert statuses[-1] == 429, f"expected 429 on 6th attempt, got {statuses}"
    # 처음 5번은 429 가 아니어야 한다 — code 는 무효하므로 401 이 된다.
    assert all(s != 429 for s in statuses[:5]), statuses


@pytest.mark.asyncio
async def test_oauth_temp_exchange_rate_limit_5_per_minute(rl_client):
    statuses: list[int] = []
    for _ in range(6):
        r = await rl_client.post(
            "/api/auth/temp-exchange",
            json={"temp_code": "00000000-0000-0000-0000-000000000000"},
        )
        statuses.append(r.status_code)
    assert statuses[-1] == 429
    assert all(s != 429 for s in statuses[:5])


# ── 4. 위조된 JWT 는 IP 폴백 ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_forged_jwt_falls_back_to_ip(rl_client, incr_fake_redis):
    """서명이 무효한 토큰은 user: 키가 아니라 ip: 키로 분류돼야 한다."""
    forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2aWN0aW0tdXVpZCIsInR5cGUiOiJhY2Nlc3MifQ.invalid"
    await rl_client.get(
        "/api/v1/qa",
        headers={"Authorization": f"Bearer {forged}"},
    )

    user_keys = [k for k in incr_fake_redis._store if k.startswith("rl:user:")]
    ip_keys = [k for k in incr_fake_redis._store if k.startswith("rl:ip:")]
    assert not user_keys, f"forged JWT must not create user bucket: {user_keys}"
    assert ip_keys, "expected IP fallback bucket"
