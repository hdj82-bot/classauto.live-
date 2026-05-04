"""요청 로깅 + 메트릭 + Rate Limiting 미들웨어."""
import contextvars
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("ifl.access")

# ── request_id contextvars (모든 로그에서 참조 가능) ─────────────────────────
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class RequestIDFilter(logging.Filter):
    """모든 로거에 request_id를 자동 주입하는 필터."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("-")
        return True


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        token = request_id_var.set(rid)

        start = time.perf_counter()
        response = None

        try:
            response = await call_next(request)
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "%s %s %d %.1fms [%s]",
                request.method,
                request.url.path,
                response.status_code if response is not None else 500,
                elapsed_ms,
                rid,
                extra={"request_id": rid},
            )
            request_id_var.reset(token)

        if response is None:
            return JSONResponse({"detail": "internal server error"}, status_code=500)
        response.headers["X-Request-ID"] = rid
        return response


# ── Rate Limiting ─────────────────────────────────────────────────────

# 경로별 레이트 제한 설정 (requests, window_seconds)
# 가장 긴 prefix가 우선 적용되므로 더 구체적인 경로를 따로 등록하면 된다.
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/render/upload": (5, 60),         # PPT 업로드: 분당 5회
    "/api/v1/render": (10, 60),               # 렌더링 요청: 분당 10회
    "/api/v1/qa": (30, 60),                   # Q&A: 분당 30회
    "/api/auth/google": (10, 60),             # OAuth 시작: 분당 10회
    # 1회용 OAuth code/temp_code 교환은 IP 단위로 강한 제한을 둬서
    # 짧은 TTL(60s) 동안 무차별 대입을 차단한다 (분당 5회).
    "/api/auth/exchange": (5, 60),
    "/api/auth/temp-exchange": (5, 60),
    # refresh 토큰 회전도 동일하게 IP+토큰 기반으로 묶는다.
    "/api/auth/refresh": (30, 60),
}

# 전체 API 기본 제한
DEFAULT_RATE_LIMIT = (120, 60)  # 분당 120회

# Rate limiting 제외 경로 — 외부 서비스 재시도(Stripe 3일)로 이벤트 유실 방지
RATE_LIMIT_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/api/v1/webhooks",          # HeyGen 렌더 웹훅
    "/api/v1/payment/webhook",   # Stripe 결제 웹훅
)

_RATE_LIMIT_EXEMPT_PATHS: frozenset[str] = frozenset(
    {"/health", "/docs", "/openapi.json", "/metrics", "/redoc"}
)


def _extract_client_id(request: Request) -> str:
    """JWT sub claim(서명 검증 필수) 우선, 실패 시 클라이언트 IP로 폴백.

    토큰을 회전(refresh)해도 같은 사용자는 같은 sub 를 가지므로
    rate limit 우회가 불가능하다. 서명이 무효한 토큰은 신뢰하지 않는다.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
        try:
            # 지연 import — 테스트용 의존성 오버라이드 방해 방지
            from jose import jwt
            from app.core.config import settings

            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
                # rate limit 키는 만료 후에도 같은 사용자로 유지해야 한다.
                # 만료된 access 토큰을 갈아끼워 카운터를 0으로 리셋하는 우회를 차단.
                options={"verify_exp": False},
            )
            sub = payload.get("sub")
            if isinstance(sub, str) and sub:
                return f"user:{sub}"
        except Exception:
            # 위조 토큰이면 IP 폴백 — 키를 토큰 해시로 잡으면
            # 매 요청마다 새 키가 만들어져 무제한이 되므로 절대 그렇게 하지 않는다.
            pass

    # X-Forwarded-For 헤더로 실제 클라이언트 IP 확인 (nginx 프록시 대응)
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        real_ip = forwarded.split(",")[0].strip() or "unknown"
    else:
        real_ip = request.client.host if request.client else "unknown"
    return f"ip:{real_ip}"


def _lookup_limit(path: str) -> tuple[int, int]:
    """가장 구체적인(긴) prefix 매치를 반환."""
    best_prefix = ""
    best_limit = DEFAULT_RATE_LIMIT
    for prefix, limit in RATE_LIMITS.items():
        if path.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
            best_limit = limit
    return best_limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis 기반 슬라이딩 윈도우 Rate Limiter."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path in _RATE_LIMIT_EXEMPT_PATHS or path.startswith(RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        try:
            from app.core.redis import get_redis
            redis = get_redis()
        except Exception:
            # Redis 연결 실패 시 rate limiting 건너뜀
            return await call_next(request)

        client_id = _extract_client_id(request)
        max_requests, window = _lookup_limit(path)

        # 경로 그룹 키 — 일관된 형식으로 생성
        path_group = "/".join(path.strip("/").split("/")[:3])
        key = f"rl:{client_id}:{path_group}"

        try:
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, window)

            remaining = max(0, max_requests - current)
            response = await call_next(request) if current <= max_requests else JSONResponse(
                status_code=429,
                content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
            )

            response.headers["X-RateLimit-Limit"] = str(max_requests)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(window)
            return response

        except Exception:
            # Redis 오류 시 요청을 차단하지 않음
            return await call_next(request)
