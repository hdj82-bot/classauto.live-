"""외부 API 호출을 위한 회로차단 / 재시도 헬퍼.

정책 (HeyGen·ElevenLabs·Claude·OpenAI 공통):

- 최대 3회 시도
- 지수 백오프: base 4s, factor 2 (4s, 8s, 16s …) — max 60s 캡
- 4xx 응답은 즉시 raise (재시도 X). 단 429 는 재시도.
- httpx.TimeoutException, 5xx, 429 만 재시도 대상.
- 매 호출에 명시적 timeout (기본 30s).

이 모듈은 외부 의존성(tenacity 등)을 추가하지 않는다 — 표준 라이브러리만
사용해 동기/비동기 모두 커버. 향후 tenacity 도입 시 같은 시그니처 유지.
"""
from __future__ import annotations

import asyncio
import functools
import logging
import random
import time
from typing import Any, Awaitable, Callable, Iterable, TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")

# ── 정책 상수 ────────────────────────────────────────────────────────────────
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BASE_DELAY = 4.0
DEFAULT_MAX_DELAY = 60.0
DEFAULT_BACKOFF_FACTOR = 2.0
DEFAULT_TIMEOUT = 30.0

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class RetryableHTTPError(RuntimeError):
    """5xx / 429 등 재시도 대상 응답을 일반 호출 흐름에서 던질 때 사용."""

    def __init__(self, status_code: int, body: str = ""):
        super().__init__(f"HTTP {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body


# ── 백오프 계산 ──────────────────────────────────────────────────────────────


def _backoff_delay(
    attempt: int,
    *,
    base: float = DEFAULT_BASE_DELAY,
    factor: float = DEFAULT_BACKOFF_FACTOR,
    cap: float = DEFAULT_MAX_DELAY,
    jitter: bool = True,
) -> float:
    """attempt(0-based) 에 대한 지수 백오프 + jitter."""
    raw = min(cap, base * (factor ** attempt))
    if jitter:
        raw *= 0.5 + random.random() / 2.0  # 50%~100% 변동
    return raw


# ── 재시도 판정 ──────────────────────────────────────────────────────────────


def _is_retryable_exception(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS
    if isinstance(exc, RetryableHTTPError):
        return True
    return False


# ── 데코레이터 ────────────────────────────────────────────────────────────────


def retry_external(
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY,
    backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
    cap_delay: float = DEFAULT_MAX_DELAY,
    extra_retry_on: Iterable[type[BaseException]] = (),
    label: str | None = None,
):
    """외부 API 호출용 재시도 데코레이터 (sync/async 자동 감지).

    예:
        @retry_external(label="claude.messages.create")
        def call_claude(...): ...
    """

    extra_types = tuple(extra_retry_on)

    def _should_retry(exc: BaseException) -> bool:
        return _is_retryable_exception(exc) or (
            extra_types and isinstance(exc, extra_types)
        )

    def decorator(func: Callable[..., Any]):
        name = label or f"{func.__module__}.{func.__name__}"
        is_coro = asyncio.iscoroutinefunction(func)

        if is_coro:
            @functools.wraps(func)
            async def awrapper(*args, **kwargs):
                last_exc: BaseException | None = None
                for attempt in range(max_attempts):
                    try:
                        return await func(*args, **kwargs)
                    except BaseException as exc:
                        if not _should_retry(exc):
                            raise
                        last_exc = exc
                        if attempt >= max_attempts - 1:
                            break
                        delay = _backoff_delay(
                            attempt,
                            base=base_delay,
                            factor=backoff_factor,
                            cap=cap_delay,
                        )
                        logger.warning(
                            "%s 재시도 %d/%d (대기 %.1fs): %s",
                            name, attempt + 1, max_attempts, delay, exc,
                        )
                        await asyncio.sleep(delay)
                assert last_exc is not None
                raise last_exc
            return awrapper

        @functools.wraps(func)
        def swrapper(*args, **kwargs):
            last_exc: BaseException | None = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except BaseException as exc:
                    if not _should_retry(exc):
                        raise
                    last_exc = exc
                    if attempt >= max_attempts - 1:
                        break
                    delay = _backoff_delay(
                        attempt,
                        base=base_delay,
                        factor=backoff_factor,
                        cap=cap_delay,
                    )
                    logger.warning(
                        "%s 재시도 %d/%d (대기 %.1fs): %s",
                        name, attempt + 1, max_attempts, delay, exc,
                    )
                    time.sleep(delay)
            assert last_exc is not None
            raise last_exc

        return swrapper

    return decorator


# ── httpx 응답 검사 헬퍼 ──────────────────────────────────────────────────────


def raise_for_retryable(resp: httpx.Response) -> None:
    """5xx/429 면 RetryableHTTPError, 4xx(429 제외) 면 즉시 HTTPStatusError."""
    if resp.status_code in RETRYABLE_STATUS:
        raise RetryableHTTPError(resp.status_code, resp.text)
    if 400 <= resp.status_code < 500:
        # 4xx 는 영구 오류 — 재시도 대상 아님. httpx 의 예외로 즉시 raise.
        raise httpx.HTTPStatusError(
            f"HTTP {resp.status_code}",
            request=resp.request,
            response=resp,
        )


# ── 비동기 retry-aware HTTP request 헬퍼 ─────────────────────────────────────


async def request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict | None = None,
    json: Any = None,
    params: dict | None = None,
    content: bytes | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    label: str | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> httpx.Response:
    """retry_external 정책으로 감싼 httpx 호출.

    4xx 응답: HTTPStatusError 즉시 raise (재시도 X)
    5xx/429 / Timeout: 최대 3회 지수백오프 재시도
    성공(2xx): 응답 그대로 반환
    """

    @retry_external(max_attempts=max_attempts, label=label or f"http.{method.lower()}")
    async def _do() -> httpx.Response:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method, url, headers=headers, json=json, params=params, content=content,
            )
        if resp.status_code >= 400:
            raise_for_retryable(resp)
        return resp

    return await _do()
