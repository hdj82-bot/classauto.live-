"""IFL Platform — 통합 FastAPI 백엔드."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.core.metrics import PrometheusMiddleware, init_app_info, metrics_response
from app.core.middleware import RateLimitMiddleware, RequestLoggingMiddleware

# 기존 라우터
from app.api.v1.auth import router as auth_router
from app.api.v1.courses import router as courses_router
from app.api.v1.lectures import router as lectures_router
from app.api.v1.questions import router as questions_router
from app.api.v1.videos import router as videos_router

# 통합된 새 라우터
from app.api.v1.sessions import router as sessions_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.render import router as render_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.attention import router as attention_router
from app.api.v1.subscription import router as subscription_router
from app.api.v1.qa import router as qa_router
from app.api.v1.translate import router as translate_router
from app.api.v1.payment import router as payment_router
from app.api.v1.admin import router as admin_router
from app.api.v1.folders import router as folders_router
from app.api.v1.avatars import router as avatars_router
from app.api.v1.voices import router as voices_router
from app.api.v1.quiz import router as quiz_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    from app.core.sentry import init_sentry
    init_sentry()
    init_app_info(version="1.0.0", environment=settings.ENVIRONMENT)
    yield


app = FastAPI(
    title="IFL Platform API",
    description="Interactive Flipped Learning Platform — 통합 백엔드",
    version="1.0.0",
    lifespan=lifespan,
    # 프로덕션에서는 Swagger UI / ReDoc 비활성화
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

register_exception_handlers(app)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(PrometheusMiddleware)

# CORS — 프로덕션에서는 명시적 origin만 허용.
# FRONTEND_URL(단일) 외에 apex/www/커스텀 도메인을 CORS_EXTRA_ORIGINS(쉼표 구분)로,
# Vercel 프리뷰는 정규식으로 허용한다. allow_credentials=True 라 와일드카드("*")는
# 쓸 수 없으므로 origin 목록을 명시적으로 구성한다.
_cors_origins = [settings.FRONTEND_URL]
if settings.ENVIRONMENT == "development":
    _cors_origins.append("http://localhost:3000")
_cors_origins += [o.strip() for o in settings.CORS_EXTRA_ORIGINS.split(",") if o.strip()]
_cors_origins = list(dict.fromkeys(_cors_origins))  # 순서 보존 중복 제거

_cors_kwargs: dict = dict(
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    # preflight 응답 24h 캐시 — 브라우저가 OPTIONS 요청을 매번 보내지 않도록.
    max_age=86400,
)
if settings.CORS_ALLOW_VERCEL_PREVIEWS:
    _cors_kwargs["allow_origin_regex"] = r"https://.*\.vercel\.app"

app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, **_cors_kwargs)

# 기존 라우터 등록
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(lectures_router)
app.include_router(questions_router)
app.include_router(videos_router)

# 새 라우터 등록
app.include_router(sessions_router)
app.include_router(dashboard_router)
app.include_router(render_router)
app.include_router(webhooks_router)
app.include_router(attention_router)
app.include_router(subscription_router)
app.include_router(qa_router)
app.include_router(translate_router)
app.include_router(payment_router)
app.include_router(admin_router)
app.include_router(folders_router)
app.include_router(avatars_router)
app.include_router(voices_router)
app.include_router(quiz_router)


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics():
    """Prometheus 스크래핑용 메트릭 엔드포인트."""
    return metrics_response()


@app.get("/health")
async def health_check():
    """경량 liveness probe — 프로세스가 떠서 응답하는지만 확인한다.

    컨테이너 HEALTHCHECK(Dockerfile.prod, timeout 5s)·업타임 모니터가 30초마다
    때리는 hot path 라 **외부 의존성(DB·Redis·S3·Celery)을 절대 건드리지 않는다**.
    의존성 점검은 `/health/deep` 로 분리 — 종전엔 여기서 celery inspect.ping(2s)
    + S3 head_bucket 등을 매번 실행해 5~10초가 걸렸고, HEALTHCHECK 타임아웃을
    넘겨 멀쩡한 컨테이너가 unhealthy 로 오판될 위험이 있었다.
    """
    return {"status": "ok", "env": settings.ENVIRONMENT}


@app.get("/health/deep")
async def health_check_deep():
    """의존성 포함 readiness 점검 — DB·Redis·S3·Celery worker 도달성.

    느릴 수 있으므로(특히 celery `inspect.ping`) liveness 와 분리한다. 운영
    점검·디버깅용으로 수동 호출하거나, 타임아웃이 넉넉한 모니터에서만 사용.
    """
    checks = {"service": "ok"}
    # DB check
    try:
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"
    # Redis check
    try:
        import redis as redis_lib
        r = redis_lib.from_url(settings.REDIS_URL, socket_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
    # S3 check
    try:
        if settings.AWS_ACCESS_KEY_ID:
            from app.services.pipeline.s3 import get_s3_client
            s3 = get_s3_client()
            s3.head_bucket(Bucket=settings.S3_BUCKET)
            checks["s3"] = "ok"
        else:
            checks["s3"] = "not_configured"
    except Exception:
        checks["s3"] = "error"
    # ── G: Celery worker 큐 도달성 검증 ──
    # broker 가 살아있어도 worker 프로세스가 0 이면 큐가 영구 적체. ping 으로 응답하는
    # worker 가 1개 이상인지 확인.
    try:
        from app.celery_app import celery as celery_app
        inspect = celery_app.control.inspect(timeout=2.0)
        ping = inspect.ping()
        if not ping:
            checks["celery"] = "no_workers"
        else:
            checks["celery"] = "ok"
    except Exception:
        checks["celery"] = "error"

    status = "ok" if all(v in ("ok", "not_configured") for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks, "env": settings.ENVIRONMENT}
