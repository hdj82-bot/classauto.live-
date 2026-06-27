"""L3: get_current_user_optional 가 인증 예외만 익명 처리하고 인프라 오류는 전파하는지.

과거엔 ``except Exception`` 으로 모든 예외를 삼켜 DB/Redis 장애까지 '익명'으로 둔갑시켰다.
이제는 JWT/토큰 형식 오류만 None(익명) 처리하고, DB·Redis 오류는 그대로 전파한다.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from app.api import deps
from app.core.security import create_access_token


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class _RedisNoBlacklist:
    async def exists(self, key):
        return 0


@pytest.mark.asyncio
async def test_optional_auth_no_credentials_returns_none():
    result = await deps.get_current_user_optional(credentials=None, db=MagicMock())
    assert result is None


@pytest.mark.asyncio
async def test_optional_auth_malformed_token_returns_none():
    """디코드 불가(JWTError) 토큰 → 익명(None), DB 미접근."""
    db = MagicMock()
    db.execute = AsyncMock(side_effect=AssertionError("DB 를 건드리면 안 된다"))
    result = await deps.get_current_user_optional(credentials=_creds("not.a.jwt"), db=db)
    assert result is None
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_optional_auth_propagates_db_error():
    """유효 토큰인데 DB 오류면 익명으로 삼키지 않고 예외를 전파한다(L3 핵심)."""
    token = create_access_token(str(uuid.uuid4()), "student")
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("db down"))

    with patch("app.api.deps.get_redis", return_value=_RedisNoBlacklist()):
        with pytest.raises(RuntimeError):
            await deps.get_current_user_optional(credentials=_creds(token), db=db)


@pytest.mark.asyncio
async def test_optional_auth_propagates_redis_error():
    """블랙리스트 조회(Redis) 오류도 전파한다 — 인프라 장애를 가리지 않음."""
    token = create_access_token(str(uuid.uuid4()), "student")
    db = MagicMock()
    db.execute = AsyncMock(side_effect=AssertionError("Redis 단계에서 멈춰야 한다"))

    class _RedisBoom:
        async def exists(self, key):
            raise RuntimeError("redis down")

    with patch("app.api.deps.get_redis", return_value=_RedisBoom()):
        with pytest.raises(RuntimeError):
            await deps.get_current_user_optional(credentials=_creds(token), db=db)
