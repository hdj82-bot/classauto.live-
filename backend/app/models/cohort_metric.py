"""CohortDailyMetric 모델 — 강의×일자 성취 지표 스냅샷 (스펙 11 §C / 10번 G7).

현 테이블들은 모두 '시점' 데이터라 시간축 추이를 그릴 수 없다. 일배치
(`app.tasks.cohort.snapshot_cohort_daily_metrics`)가 매일 강의별 누적 지표를
한 행으로 스냅샷해 여기 적재하고, `/api/v1/dashboard/{lecture_id}/trend` 가
이를 라인 차트로 돌려준다. 소급 수집 불가(09 §3) — 배포 시점부터 쌓인다.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CohortDailyMetric(Base):
    """강의 한 곳의 하루치 누적 지표 스냅샷."""

    __tablename__ = "cohort_daily_metrics"
    __table_args__ = (
        # (강의, 일자) 1행 — 같은 날 재실행은 upsert(갱신)되어야 중복이 안 쌓인다.
        UniqueConstraint("lecture_id", "metric_date", name="uq_cohort_metric_lecture_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # KST 달력 기준 날짜(배치가 UTC 어느 시각에 돌든 한국 날짜로 라벨링).
    metric_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # 모든 비율은 0~100(%). 누적 기준(해당 일자까지 들어온 전체 데이터).
    completion_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    attendance_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_accuracy: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    qa_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_learners: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
