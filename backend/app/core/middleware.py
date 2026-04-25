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
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/render/upload": (5, 60),       # PPT 업로드: 분당 5회
    "/api/v1/render": (10, 60),             # 렌더링 요청: 분당 10회
    "/api/v1/qa": (30, 60),                 # Q&A: 분당 30회
    "/api/auth/google": (10, 60),           # OAuth: 분당 10회
}

# 전체 API 기본 제한
DEFAULT_RATE_LIMIT = (120, 60)  # 분당 120회

# Rate limiting 제외 경로 — 외부 서비스 재시도(Stripe 3일)로 이벤트 유실 방지
RATE_LIMIT_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/api/v1/webhooks",          # HeyGen 렌더 웹훅
    "/api/v1/payment/webhook",   # Stripe 결제 웹훅
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis 기반 슬라이딩 윈도우 Rate Limiter."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # 정적 파일, 헬스체크, 웹훅은 제외
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json") or path.startswith(RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        try:
            from app.core.redis import get_redis
            redis = get_redis()
        except Exception:
            # Redis 연결 실패 시 rate limiting 건너뜀
            return await call_next(request)

        # 클라이언트 식별: JWT sub claim 또는 실제 클라이언트 IP
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            # JWT에서 sub(user_id)를 추출하여 정확한 사용자 식별
            import hashlib as _hl
            token_hash = _hl.sha256(auth[7:].encode()).hexdigest()[:16]
            client_id = f"user:{token_hash}"
        else:
            # X-Forwarded-For 헤더로 실제 클라이언트 IP 확인 (nginx 프록시 대응)
            forwarded = request.headers.get("X-Forwarded-For", "")
            if forwarded:
                real_ip = forwarded.split(",")[0].strip()
            else:
                real_ip = request.client.host if request.client else "unknown"
            client_id = f"ip:{real_ip}"

        # 경로별 제한 확인
        max_requests, window = DEFAULT_RATE_LIMIT
        for prefix, limit in RATE_LIMITS.items():
            if path.startswith(prefix):
                max_requests, window = limit
                break

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
