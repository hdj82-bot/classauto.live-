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
    # PG enum ``costcategory`` 라벨은 대문자 '값'(LLM_QA·STT·TTS·OTHER·AVATAR_QA;
    # 0006/0058 마이그레이션)으로 만들어졌다. values_callable 이 없으면 SQLAlchemy 는
    # 멤버 '이름'(소문자: llm_qa·avatar_qa…)을 DB 로 보내, 라벨 불일치
    # (InvalidTextRepresentation: invalid input value for enum costcategory)로 이 테이블의
    # 적재·카테고리 필터 조회가 실패한다(그동안 platform_cost_logs 가 0건이던 원인).
    # 본인 얼굴 Q&A 렌더는 제출 직전 ``budget.visionstory_spend_usd`` 필터가 크래시해
    # 통째로 실패했다(0063 이 avatar_qa 소문자 라벨을 임시로 더해 그 한 경로만 살렸다).
    # 값(대문자)을 쓰도록 명시해 DB enum 라벨과 일치시킨다 — 모든 카테고리를 한 번에 정합.
    category: Mapped[CostCategory] = mapped_column(
        SAEnum(CostCategory, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
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
