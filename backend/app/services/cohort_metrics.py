"""성취율 추이 — 강의×일자 일배치 스냅샷 + 조회 (스펙 11 §C / 10번 G7).

`_compute_metrics` 는 `services/dashboard.py` 의 attendance/scores/engagement 와
동일한 기준을 쓰되, 일배치(SyncSession)에서 한 강의의 누적 지표를 한 번에 계산해
한 행으로 압축한다. 추이 조회(`get_trend`)만 async(요청 경로)다.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.assessment_result import AssessmentResult
from app.models.cohort_metric import CohortDailyMetric
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.session import LearningSession

logger = logging.getLogger(__name__)

# KST 기준 '오늘' — 배치가 UTC 어느 시각에 돌든 한국 달력 날짜로 라벨링한다.
_KST = timezone(timedelta(hours=9))


def today_kst() -> date:
    """현재 KST 달력 날짜."""
    return datetime.now(_KST).date()


def _compute_metrics(db: Session, lecture_id: uuid.UUID) -> dict:
    """강의 한 곳의 '현재까지 누적' 지표를 계산(스냅샷 1행 분량)."""
    sessions = list(
        db.execute(
            select(
                LearningSession.user_id,
                LearningSession.progress_pct,
                LearningSession.started_at,
            ).where(LearningSession.lecture_id == lecture_id)
        ).all()
    )
    total_sessions = len(sessions)
    active_learners = len({s.user_id for s in sessions})
    completion_rate = (
        round(sum((s.progress_pct or 0) for s in sessions) / total_sessions, 2)
        if total_sessions
        else 0.0
    )

    # 출석 인정율 — get_attendance 와 동일 기준(강의별 deadline → 전역 기본).
    # 최초 시작 세션 기준 deadline 안에 시작한 비율.
    attendance_rate = 0.0
    started = [s.started_at for s in sessions if s.started_at]
    if started and total_sessions:
        lecture = db.get(Lecture, lecture_id)
        deadline_min = (
            lecture.live_deadline_minutes
            if lecture is not None and lecture.live_deadline_minutes is not None
            else settings.DEFAULT_LIVE_DEADLINE_MINUTES
        )
        deadline = min(started) + timedelta(minutes=deadline_min)
        live = sum(1 for s in started if s <= deadline)
        attendance_rate = round(live / total_sessions * 100, 2)

    # 평균 정답률 — assessment_results 누적. get_scores 와 동일하게 파이썬에서
    # 집계(베타 규모·방언 비의존). is_correct 한 컬럼만 끌어온다.
    correctness = list(
        db.execute(
            select(AssessmentResult.is_correct).where(
                AssessmentResult.lecture_id == lecture_id
            )
        )
        .scalars()
        .all()
    )
    total_q = len(correctness)
    avg_accuracy = (
        round(sum(1 for c in correctness if c) / total_q * 100, 2) if total_q else 0.0
    )

    qa_count = (
        db.execute(
            select(func.count(QALog.id)).where(QALog.lecture_id == lecture_id)
        ).scalar()
        or 0
    )

    return {
        "completion_rate": completion_rate,
        "attendance_rate": attendance_rate,
        "avg_accuracy": avg_accuracy,
        "qa_count": int(qa_count),
        "active_learners": active_learners,
    }


def snapshot_lecture_day(
    db: Session, lecture_id: uuid.UUID, day: date
) -> CohortDailyMetric:
    """(강의, 일자) 한 행을 계산해 upsert. 같은 날 재실행은 갱신(중복 없음)."""
    metrics = _compute_metrics(db, lecture_id)
    row = db.execute(
        select(CohortDailyMetric).where(
            CohortDailyMetric.lecture_id == lecture_id,
            CohortDailyMetric.metric_date == day,
        )
    ).scalar_one_or_none()
    if row is None:
        row = CohortDailyMetric(lecture_id=lecture_id, metric_date=day, **metrics)
        db.add(row)
    else:
        for key, value in metrics.items():
            setattr(row, key, value)
    return row


def snapshot_all(db: Session, day: date | None = None) -> int:
    """학습 세션이 1건 이상인 모든 강의를 스냅샷. 반환 = 처리한 강의 수.

    초안/미사용 강의에는 빈 행을 만들지 않도록 세션 보유 강의로만 한정한다.
    """
    target_day = day or today_kst()
    lecture_ids = list(
        db.execute(
            select(LearningSession.lecture_id).distinct()
        ).scalars().all()
    )
    for lecture_id in lecture_ids:
        snapshot_lecture_day(db, lecture_id, target_day)
    db.commit()
    return len(lecture_ids)


async def get_trend(
    db: AsyncSession, lecture_id: uuid.UUID, days: int = 30
) -> dict:
    """최근 ``days`` 일의 일자별 스냅샷(오래된 → 최신)."""
    since = today_kst() - timedelta(days=days - 1)
    rows = list(
        (
            await db.execute(
                select(CohortDailyMetric)
                .where(
                    CohortDailyMetric.lecture_id == lecture_id,
                    CohortDailyMetric.metric_date >= since,
                )
                .order_by(CohortDailyMetric.metric_date.asc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "lecture_id": str(lecture_id),
        "points": [
            {
                "date": r.metric_date.isoformat(),
                "completionRate": r.completion_rate,
                "attendanceRate": r.attendance_rate,
                "avgAccuracy": r.avg_accuracy,
                "qaCount": r.qa_count,
                "activeLearners": r.active_learners,
            }
            for r in rows
        ],
    }
