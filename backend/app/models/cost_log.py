"""CostLog 모델 (NestJS CostLog + 플랫폼 비용 추적 통합)."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CostCategory(str, enum.Enum):
    llm_qa = "LLM_QA"
    llm_assessment = "LLM_ASSESSMENT"
    llm_summary = "LLM_SUMMARY"
    stt = "STT"
    tts = "TTS"
    other = "OTHER"


class CostLog(Base):
    """플랫폼 전체 비용 추적 (LLM, TTS 등)."""
    __tablename__ = "platform_cost_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[CostCategory] = mapped_column(
        SAEnum(CostCategory), nullable=False
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
