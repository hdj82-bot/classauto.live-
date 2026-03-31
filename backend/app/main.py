"""IFL Platform — 통합 FastAPI 백엔드."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

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
from app.api.v1.translate import router as translate_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="IFL Platform API",
    description="Interactive Flipped Learning Platform — 통합 백엔드",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(translate_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ifl-platform"}
