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

# CORS — 프로덕션에서는 명시적 origin만 허용
_cors_origins = [settings.FRONTEND_URL]
if settings.ENVIRONMENT == "development":
    _cors_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=600,
)

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


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics():
    """Prometheus 스크래핑용 메트릭 엔드포인트."""
    return metrics_response()


@app.get("/health")
async def health_check():
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

    status = "ok" if all(v in ("ok", "not_configured") for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks, "env": settings.ENVIRONMENT}
