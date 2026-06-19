"""LearningGoal 모델 — 강의별 학습 목표·달성률 (스펙 11 §H-3 / 10번 G9).

평가 사전/사후(assessment_results.occasion)가 아직 없으므로, "before→after" 는
목표 생성 시점의 지표값을 ``baseline_value`` 로 스냅샷(=before)하고 현재값(=after)
과 목표(target)를 비교해 달성률을 낸다. occasion 기반 정밀 사전/사후는 평가
파이프라인 확장 후 후속(현 모델과 호환 유지).
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LearningGoal(Base):
    """강의 한 곳의 목표 1건 (지표·목표값·생성 시점 baseline)."""

    __tablename__ = "learning_goals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 지표 키 — schema GoalMetric enum 으로 검증(completionRate/attendanceRate/
    # avgAccuracy/qaCount). DB 는 문자열로 단순 저장.
    metric: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    # 목표 생성 시점의 지표값(= before). 데이터가 없으면 0.
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
