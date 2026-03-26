"""IFL Pipeline — FastAPI 애플리케이션 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.qa import router as qa_router
from app.api.routes import router
from app.api.translate import router as translate_router
from app.api.versioning import router as versioning_router
from app.api.webhooks import router as webhooks_router
from app.database import Base, engine

# 모든 모델 import → create_all 시 테이블 생성 보장
from app.models.embedding import SlideEmbedding  # noqa: F401
from app.models.qa import QALog  # noqa: F401
from app.models.session_log import CostLog, SessionLog  # noqa: F401
from app.models.translation import ScriptTranslation  # noqa: F401
from app.models.video import Script, Slide, Video, VideoVersion  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="IFL Pipeline",
    description="PPT 업로드 → 파싱 → 임베딩 → 스크립트 → 번역 → 영상 → 버전 관리",
    version="0.5.0",
    lifespan=lifespan,
)

app.include_router(router)
app.include_router(qa_router)
app.include_router(translate_router)
app.include_router(versioning_router)
app.include_router(webhooks_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
