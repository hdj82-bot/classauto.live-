"""학습 세션 로그 및 비용 로그 모델."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.database import Base


class SessionLog(Base):
    """학습자 시청 세션 로그."""
    __tablename__ = "session_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(64), nullable=True)
    video_version = Column(Integer, default=1)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    archived = Column(Boolean, default=False)


class CostLog(Base):
    """외부 API 비용 추적 로그."""
    __tablename__ = "cost_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    service = Column(String(32), nullable=False)  # "heygen", "claude", "openai", "deepl", "google_translate"
    operation = Column(String(64), nullable=False)  # "render_video", "generate_script", etc.
    amount_usd = Column(Float, nullable=False, default=0.0)
    detail = Column(Text, default="")  # JSON 메타데이터
    created_at = Column(DateTime, default=datetime.utcnow)
