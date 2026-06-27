"""M1: Google OAuth exchange 시 이메일 인증 여부 검증 단위 테스트.

미검증 이메일(verified_email/email_verified != true)은 ValueError 로 거부한다.
교수자 초대 게이트가 이메일을 신뢰 식별자로 쓰므로 소유가 검증된 이메일만 통과시킨다.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


class _FakeResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


class _FakeAsyncClient:
    """httpx.AsyncClient 컨텍스트 매니저 흉내 — token POST, userinfo GET 을 고정 응답."""

    def __init__(self, token_data, userinfo, **kwargs):
        self._token = token_data
        self._userinfo = userinfo

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None):
        return _FakeResp(self._token)

    async def get(self, url, headers=None):
        return _FakeResp(self._userinfo)


def _patch_httpx(userinfo):
    token_data = {"access_token": "ya29.fake"}

    def _factory(**kwargs):
        return _FakeAsyncClient(token_data, userinfo)

    return patch("app.services.auth.httpx.AsyncClient", side_effect=_factory)


@pytest.mark.asyncio
async def test_exchange_accepts_verified_email_v2():
    """v2 userinfo: verified_email=True → userinfo 반환."""
    from app.services.auth import exchange_google_code

    userinfo = {"id": "g-1", "email": "prof@kyonggi.ac.kr", "name": "교수", "verified_email": True}
    with _patch_httpx(userinfo):
        result = await exchange_google_code("any-code")
    assert result["email"] == "prof@kyonggi.ac.kr"


@pytest.mark.asyncio
async def test_exchange_accepts_email_verified_openid():
    """OpenID 스타일: email_verified=True 도 인정."""
    from app.services.auth import exchange_google_code

    userinfo = {"id": "g-2", "email": "a@b.ac.kr", "name": "A", "email_verified": True}
    with _patch_httpx(userinfo):
        result = await exchange_google_code("any-code")
    assert result["id"] == "g-2"


@pytest.mark.asyncio
async def test_exchange_accepts_string_true():
    """일부 응답이 문자열 'true' 로 줄 때도 인정."""
    from app.services.auth import exchange_google_code

    userinfo = {"id": "g-3", "email": "c@d.ac.kr", "name": "C", "verified_email": "true"}
    with _patch_httpx(userinfo):
        result = await exchange_google_code("any-code")
    assert result["email"] == "c@d.ac.kr"


@pytest.mark.asyncio
async def test_exchange_rejects_unverified_email():
    """verified_email=False → ValueError 로 거부."""
    from app.services.auth import exchange_google_code

    userinfo = {"id": "g-4", "email": "evil@x.com", "name": "E", "verified_email": False}
    with _patch_httpx(userinfo):
        with pytest.raises(ValueError):
            await exchange_google_code("any-code")


@pytest.mark.asyncio
async def test_exchange_rejects_missing_verification_field():
    """검증 필드가 아예 없으면(불명) 거부 — 안전 기본값."""
    from app.services.auth import exchange_google_code

    userinfo = {"id": "g-5", "email": "unknown@x.com", "name": "U"}
    with _patch_httpx(userinfo):
        with pytest.raises(ValueError):
            await exchange_google_code("any-code")
