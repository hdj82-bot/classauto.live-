"""슬라이드 임베딩 SQLAlchemy 모델."""

from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.config import settings
from app.database import Base


class SlideEmbedding(Base):
    __tablename__ = "slide_embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    slide_id = Column(Integer, ForeignKey("slides.id", ondelete="CASCADE"), nullable=True)
    text_content = Column(Text, nullable=False)
    embedding = Column(Vector(settings.embedding_dimensions), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
