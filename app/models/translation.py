"""스크립트 번역 SQLAlchemy 모델."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.database import Base


class ScriptTranslation(Base):
    __tablename__ = "script_translations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    script_id = Column(Integer, ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(10), nullable=False)   # ISO 639-1: en, vi, zh, ja ...
    content = Column(Text, nullable=False)
    provider = Column(String(20), nullable=False)   # "deepl" | "google"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("script_id", "language", name="uq_script_translations_script_lang"),
    )
