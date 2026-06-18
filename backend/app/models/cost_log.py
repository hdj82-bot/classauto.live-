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
    # Q&A 아바타 렌더(HeyGen 퍼블릭 / VisionStory 본인 얼굴) 비용. QA 렌더는
    # VideoRender 가 없어 render_cost_logs(video_render_id FK)에 못 들어가므로,
    # lecture_id 키의 platform_cost_logs 에 이 카테고리로 적재한다(운영자 비용
    # 대시보드 과소집계 해소 — qa_batch._record_qa_render_cost).
    avatar_qa = "AVATAR_QA"
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
    # B(스펙 13): admin /costs 가 월별 GROUP BY + 시간 윈도우로 집계 — 색인 필요.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
