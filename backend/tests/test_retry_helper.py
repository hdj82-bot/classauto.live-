"""app.core.retry — 회로차단/재시도 헬퍼 회귀 테스트.

검증:
- 5xx/429/Timeout 은 최대 3회까지 재시도
- 4xx(429 제외) 는 즉시 raise (재시도 X)
- 재시도 횟수 한도 도달 시 마지막 예외 그대로 raise
- 동기/비동기 함수 모두 지원
- extra_retry_on 으로 사용자 예외 추가 재시도
"""
from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest

from app.core.retry import (
    RETRYABLE_STATUS,
    RetryableHTTPError,
    raise_for_retryable,
    retry_external,
)


# 백오프 sleep 무력화 — 테스트가 실시간 대기하지 않도록.
@pytest.fixture(autouse=True)
def _no_sleep():
    with patch("app.core.retry._backoff_delay", return_value=0.0), \
         patch("time.sleep", return_value=None), \
         patch("asyncio.sleep") as async_sleep:
        async_sleep.return_value = None
        yield


# ── raise_for_retryable ────────────────────────────────────────────────────────


@pytest.mark.parametrize("code", sorted(RETRYABLE_STATUS))
def test_raise_for_retryable_5xx_or_429(code):
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(code, request=req, text="boom")
    with pytest.raises(RetryableHTTPError) as exc:
        raise_for_retryable(resp)
    assert exc.value.status_code == code


@pytest.mark.parametrize("code", [400, 401, 403, 404, 409, 422])
def test_raise_for_retryable_4xx_immediate(code):
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(code, request=req, text="bad")
    with pytest.raises(httpx.HTTPStatusError):
        raise_for_retryable(resp)


def test_raise_for_retryable_2xx_passthrough():
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(200, request=req)
    raise_for_retryable(resp)  # no raise


# ── retry_external (sync) ─────────────────────────────────────────────────────


def test_sync_retry_succeeds_on_third_attempt():
    calls = {"n": 0}

    @retry_external(label="test.sync")
    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RetryableHTTPError(503, "tmp")
        return "ok"

    assert flaky() == "ok"
    assert calls["n"] == 3


def test_sync_retry_exhausted_raises_last():
    @retry_external(label="test.sync.exhaust")
    def always_503():
        raise RetryableHTTPError(503, "down")

    with pytest.raises(RetryableHTTPError):
        always_503()


def test_sync_4xx_not_retried():
    calls = {"n": 0}
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(404, request=req)

    @retry_external(label="test.sync.4xx")
    def f():
        calls["n"] += 1
        raise httpx.HTTPStatusError("404", request=req, response=resp)

    with pytest.raises(httpx.HTTPStatusError):
        f()
    assert calls["n"] == 1  # 단 한 번만 호출


def test_sync_unrelated_exception_not_retried():
    calls = {"n": 0}

    @retry_external(label="test.sync.misc")
    def f():
        calls["n"] += 1
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        f()
    assert calls["n"] == 1


def test_sync_extra_retry_on():
    calls = {"n": 0}

    class MyTransientError(Exception):
        pass

    @retry_external(label="test.sync.extra", extra_retry_on=(MyTransientError,))
    def f():
        calls["n"] += 1
        if calls["n"] < 2:
            raise MyTransientError("retry me")
        return 42

    assert f() == 42
    assert calls["n"] == 2


# ── retry_external (async) ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_async_retry_succeeds_on_second_attempt():
    calls = {"n": 0}
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(429, request=req)

    @retry_external(label="test.async")
    async def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.HTTPStatusError("429", request=req, response=resp)
        return "ok"

    assert await flaky() == "ok"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_async_4xx_not_retried():
    calls = {"n": 0}
    req = httpx.Request("GET", "http://x")
    resp = httpx.Response(401, request=req)

    @retry_external(label="test.async.4xx")
    async def f():
        calls["n"] += 1
        raise httpx.HTTPStatusError("401", request=req, response=resp)

    with pytest.raises(httpx.HTTPStatusError):
        await f()
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_async_timeout_retried():
    calls = {"n": 0}

    @retry_external(label="test.async.timeout")
    async def f():
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectTimeout("slow")
        return "done"

    assert await f() == "done"
    assert calls["n"] == 3
