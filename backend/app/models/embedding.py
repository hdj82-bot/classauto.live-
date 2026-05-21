"""SlideEmbedding 모델 (app/ embedding 흡수)."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.base import Base

EMBEDDING_DIMENSIONS = 1536  # OpenAI text-embedding-3-small


class SlideEmbedding(Base):
    __tablename__ = "slide_embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    # PPTX 를 LibreOffice 헤드리스로 렌더한 슬라이드 PNG 의 S3 https URL.
    # studio 편집기가 중앙 미리보기에서 ``<img>`` 로 직접 노출. 렌더 실패 시 NULL —
    # 파이프라인은 graceful 하게 진행되고 프론트는 fallback mock 으로 그린다.
    slide_image_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
