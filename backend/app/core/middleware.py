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
    {"/health", "/health/deep", "/docs", "/openapi.json", "/metrics", "/redoc"}
)

# Redis 장애로 레이트리밋을 평가할 수 없을 때 fail-closed 로 막을 비용·보안 민감 prefix.
# (M3) 종전엔 Redis 연결/연산 실패 시 전 경로를 통과시켜(fail-open), 장애 중에 인증
# brute-force·고가 렌더/LLM 호출이 무제한으로 새어 나갈 수 있었다. 아래 prefix 는
# 레이트리밋이 죽으면 503 으로 차단하고(가용성보다 비용·보안 우선), 그 외 값싼 읽기
# 경로는 종전처럼 fail-open(가용성 우선)으로 둔다.
#   - /api/auth     : 로그인·OAuth 코드 교환·refresh — 무차별 대입 보호
#   - /api/v1/render: PPT 업로드·영상 렌더 — HeyGen/TTS 비용
#   - /api/v1/qa    : 학생 RAG Q&A — Claude/임베딩 비용
RATE_LIMIT_FAIL_CLOSED_PREFIXES: tuple[str, ...] = (
    "/api/auth",
    "/api/v1/render",
    "/api/v1/qa",
)

# 앱 앞단에 있는 신뢰 프록시 홉 수(Railway 엣지 → 컨테이너의 단일 리버스 프록시 기준 1).
# X-Forwarded-For 는 "client, proxy1, proxy2 ..." 순으로 각 홉이 자신이 직접 본 IP 를
# 오른쪽 끝에 덧붙인다. 맨 앞(leftmost) 항목은 클라이언트가 임의로 위조할 수 있어
# 레이트리밋 키로 쓰면 헤더만 바꿔가며 무제한 우회가 된다(C3-a). 신뢰 프록시가 덧붙인
# "마지막 홉(rightmost)"에서 이 값만큼 들어간 항목이 실제 클라이언트 IP 다. 프록시 단을
# 늘리면(예: 별도 nginx 추가) 이 상수를 키운다. config.py 는 다른 작업 소유라 여기 둔다.
_TRUSTED_PROXY_HOPS = 1


def _client_ip_from_forwarded(forwarded: str) -> str | None:
    """X-Forwarded-For 에서 신뢰 가능한 클라이언트 IP(마지막 홉 기준)를 뽑는다.

    leftmost 항목은 클라이언트가 위조 가능하므로 절대 신뢰하지 않고, 신뢰 프록시가
    덧붙인 오른쪽 홉만 사용한다. 항목이 기대보다 적으면(설정 불일치 등) 가장 왼쪽으로
    클램프해 best-effort 로 동작한다. 빈 헤더면 None.
    """
    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    if not hops:
        return None
    idx = min(_TRUSTED_PROXY_HOPS, len(hops))
    return hops[-idx]


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

    # X-Forwarded-For 헤더로 실제 클라이언트 IP 확인 (신뢰 프록시 마지막 홉 기준).
    # leftmost(클라 위조 가능) 가 아니라 신뢰 프록시가 덧붙인 홉을 사용해 레이트리밋
    # 우회를 차단한다(_client_ip_from_forwarded). 헤더가 없으면 직접 peer 로 폴백.
    forwarded = request.headers.get("X-Forwarded-For", "")
    real_ip = _client_ip_from_forwarded(forwarded) if forwarded else None
    if not real_ip:
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


def _rate_limit_unavailable_response() -> JSONResponse:
    """레이트리밋을 평가할 수 없을 때(Redis 장애) 민감 경로에 돌려줄 503 응답."""
    return JSONResponse(
        status_code=503,
        content={"detail": "일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요."},
        headers={"Retry-After": "5"},
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis 기반 슬라이딩 윈도우 Rate Limiter."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path in _RATE_LIMIT_EXEMPT_PATHS or path.startswith(RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        # 비용·보안 민감 경로는 Redis 장애 시 통과시키지 않는다(fail-closed).
        fail_closed = path.startswith(RATE_LIMIT_FAIL_CLOSED_PREFIXES)

        try:
            from app.core.redis import get_redis
            redis = get_redis()
        except Exception:
            # Redis 연결 실패 — 민감 경로는 차단(503), 값싼 읽기는 통과(fail-open).
            logger.warning("rate-limit Redis 연결 실패 (path=%s, fail_closed=%s)", path, fail_closed)
            if fail_closed:
                return _rate_limit_unavailable_response()
            return await call_next(request)

        client_id = _extract_client_id(request)
        max_requests, window = _lookup_limit(path)

        # 경로 그룹 키 — 일관된 형식으로 생성
        path_group = "/".join(path.strip("/").split("/")[:3])
        key = f"rl:{client_id}:{path_group}"

        # ── Redis 카운터 평가 ── 여기서 나는 예외만 "Redis 장애"로 취급한다.
        # call_next(엔드포인트 실행)는 이 try 밖에서 호출해, 실제 앱 5xx 가 레이트리밋
        # 장애(503)로 둔갑하지 않게 한다.
        try:
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, window)
        except Exception:
            # Redis 연산 오류 — 민감 경로는 차단(503), 값싼 읽기는 통과(fail-open).
            logger.warning("rate-limit Redis 연산 실패 (path=%s, fail_closed=%s)", path, fail_closed)
            if fail_closed:
                return _rate_limit_unavailable_response()
            return await call_next(request)

        remaining = max(0, max_requests - current)
        if current > max_requests:
            response: Response = JSONResponse(
                status_code=429,
                content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
            )
        else:
            response = await call_next(request)

        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(window)
        return response
