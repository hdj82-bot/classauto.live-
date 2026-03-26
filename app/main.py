"""IFL Pipeline — FastAPI 애플리케이션 진입점."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.qa import router as qa_router
from app.api.routes import router
from app.database import Base, engine

# 모든 모델 import → create_all 시 테이블 생성 보장
from app.models.embedding import SlideEmbedding  # noqa: F401
from app.models.qa import QALog  # noqa: F401
from app.models.video import Script, Slide, Video  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="IFL Pipeline",
    description="PPT 업로드 → 파싱 → 임베딩 → 스크립트 생성 → 검토 파이프라인",
    version="0.3.0",
    lifespan=lifespan,
)

app.include_router(router)
app.include_router(qa_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
