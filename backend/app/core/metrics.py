"""Prometheus 메트릭 수집."""
import time

from prometheus_client import Counter, Histogram, Gauge, Info, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# ── 메트릭 정의 ──────────────────────────────────────────────────────────────

APP_INFO = Info("ifl_app", "IFL Platform application info")

REQUEST_COUNT = Counter(
    "ifl_http_requests_total",
    "Total HTTP requests",
    ["method", "path_template", "status_code"],
)

REQUEST_DURATION = Histogram(
    "ifl_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path_template"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

REQUESTS_IN_PROGRESS = Gauge(
    "ifl_http_requests_in_progress",
    "Number of HTTP requests currently in progress",
    ["method"],
)

CELERY_TASK_COUNT = Counter(
    "ifl_celery_tasks_total",
    "Total Celery tasks executed",
    ["task_name", "status"],
)

EXTERNAL_API_CALLS = Counter(
    "ifl_external_api_calls_total",
    "Total external API calls",
    ["service", "status"],
)

EXTERNAL_API_DURATION = Histogram(
    "ifl_external_api_duration_seconds",
    "External API call duration in seconds",
    ["service"],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)


def init_app_info(version: str, environment: str) -> None:
    """애플리케이션 정보 메트릭 초기화."""
    APP_INFO.info({"version": version, "environment": environment})


# ── 경로 정규화 ──────────────────────────────────────────────────────────────

def _normalize_path(path: str) -> str:
    """UUID/ID 파라미터를 {id}로 치환하여 카디널리티 제한."""
    import re
    # UUID 패턴
    path = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "{id}",
        path,
    )
    # 숫자 ID
    path = re.sub(r"/\d+(?=/|$)", "/{id}", path)
    return path


# ── Prometheus 미들웨어 ──────────────────────────────────────────────────────

class PrometheusMiddleware(BaseHTTPMiddleware):
    """HTTP 요청/응답 메트릭을 수집하는 미들웨어."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # /metrics, /health, static 파일은 메트릭에서 제외
        if path in ("/metrics", "/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        method = request.method
        path_template = _normalize_path(path)

        REQUESTS_IN_PROGRESS.labels(method=method).inc()
        start = time.perf_counter()

        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.perf_counter() - start
            REQUESTS_IN_PROGRESS.labels(method=method).dec()
            REQUEST_COUNT.labels(
                method=method,
                path_template=path_template,
                status_code=str(status_code),
            ).inc()
            REQUEST_DURATION.labels(
                method=method,
                path_template=path_template,
            ).observe(duration)

        return response


def metrics_response() -> Response:
    """Prometheus 스크래핑용 /metrics 응답 생성."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
