"""IFL HeyGen — FastAPI 애플리케이션 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.attention import attention_router
from app.api.routes import router
from app.api.subscription import subscription_router
from app.api.webhooks import webhook_router
from app.database import Base, async_engine
from app.models.session_log import SessionLog  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.video import CostLog, VideoRender  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 테이블 생성
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="IFL HeyGen",
    description="HeyGen 아바타 립싱크 렌더링 파이프라인",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)
app.include_router(subscription_router)
app.include_router(attention_router)
app.include_router(webhook_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ifl-heygen"}
