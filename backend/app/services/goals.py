"""학습 목표·달성률 서비스 (스펙 11 §H-3 / 10번 G9).

현재값(=after)은 라이브로 계산한다(목표는 '지금 달성했는가'가 핵심이라 일배치
스냅샷보다 실시간이 적절). baseline(=before)은 목표 생성 시점에 한 번 스냅샷한다.
현재값 계산은 dashboard/cohort 와 동일 기준(완료율·출석 인정율·평균 정답률·질문 수).
"""
from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.assessment_result import AssessmentResult
from app.models.learning_goal import LearningGoal
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.session import LearningSession
from app.schemas.goal import GoalCreate, GoalUpdate


async def _current_metrics(db: AsyncSession, lecture_id: uuid.UUID) -> dict[str, float]:
    """강의의 현재 지표 4종(라이브). cohort_metrics._compute_metrics 의 async 사본."""
    sessions = list(
        (
            await db.execute(
                select(
                    LearningSession.progress_pct, LearningSession.started_at
                ).where(LearningSession.lecture_id == lecture_id)
            )
        ).all()
    )
    total = len(sessions)
    completion = (
        round(sum((s.progress_pct or 0) for s in sessions) / total, 2) if total else 0.0
    )

    attendance = 0.0
    started = [s.started_at for s in sessions if s.started_at]
    if started and total:
        lecture = await db.get(Lecture, lecture_id)
        deadline_min = (
            lecture.live_deadline_minutes
            if lecture is not None and lecture.live_deadline_minutes is not None
            else settings.DEFAULT_LIVE_DEADLINE_MINUTES
        )
        deadline = min(started) + timedelta(minutes=deadline_min)
        attendance = round(sum(1 for s in started if s <= deadline) / total * 100, 2)

    correctness = list(
        (
            await db.execute(
                select(AssessmentResult.is_correct).where(
                    AssessmentResult.lecture_id == lecture_id
                )
            )
        ).scalars().all()
    )
    accuracy = (
        round(sum(1 for c in correctness if c) / len(correctness) * 100, 2)
        if correctness
        else 0.0
    )

    qa = (
        await db.execute(
            select(func.count(QALog.id)).where(QALog.lecture_id == lecture_id)
        )
    ).scalar() or 0

    return {
        "completionRate": completion,
        "attendanceRate": attendance,
        "avgAccuracy": accuracy,
        "qaCount": float(qa),
    }


def _progress_pct(baseline: float | None, current: float, target: float) -> float:
    """baseline(before) → current(after) → target 기준 달성률(0~100)."""
    base = baseline if baseline is not None else 0.0
    denom = target - base
    if denom <= 0:
        # 목표가 시작값 이하(이미 충분) — 현재가 목표 이상이면 100, 아니면 0.
        return 100.0 if current >= target else 0.0
    return round(max(0.0, min(1.0, (current - base) / denom)) * 100, 1)


def _to_response(goal: LearningGoal, current: float) -> dict:
    return {
        "id": goal.id,
        "lecture_id": goal.lecture_id,
        "metric": goal.metric,
        "label": goal.label,
        "target_value": goal.target_value,
        "baseline_value": goal.baseline_value,
        "current_value": current,
        "progress_pct": _progress_pct(goal.baseline_value, current, goal.target_value),
        "achieved": current >= goal.target_value,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
    }


async def list_goals(db: AsyncSession, lecture_id: uuid.UUID) -> list[dict]:
    goals = list(
        (
            await db.execute(
                select(LearningGoal)
                .where(LearningGoal.lecture_id == lecture_id)
                .order_by(LearningGoal.created_at.asc())
            )
        ).scalars().all()
    )
    if not goals:
        return []
    metrics = await _current_metrics(db, lecture_id)
    return [_to_response(g, metrics.get(g.metric, 0.0)) for g in goals]


async def create_goal(
    db: AsyncSession, lecture_id: uuid.UUID, body: GoalCreate
) -> dict:
    metrics = await _current_metrics(db, lecture_id)
    baseline = metrics.get(body.metric.value, 0.0)
    goal = LearningGoal(
        lecture_id=lecture_id,
        metric=body.metric.value,
        label=body.label,
        target_value=body.target_value,
        baseline_value=baseline,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _to_response(goal, metrics.get(goal.metric, 0.0))


async def _get_owned_goal(
    db: AsyncSession, lecture_id: uuid.UUID, goal_id: uuid.UUID
) -> LearningGoal:
    goal = await db.get(LearningGoal, goal_id)
    if goal is None or goal.lecture_id != lecture_id:
        raise HTTPException(status_code=404, detail="목표를 찾을 수 없습니다.")
    return goal


async def update_goal(
    db: AsyncSession, lecture_id: uuid.UUID, goal_id: uuid.UUID, body: GoalUpdate
) -> dict:
    goal = await _get_owned_goal(db, lecture_id, goal_id)
    if body.label is not None:
        goal.label = body.label
    if body.target_value is not None:
        goal.target_value = body.target_value
    await db.commit()
    await db.refresh(goal)
    metrics = await _current_metrics(db, lecture_id)
    return _to_response(goal, metrics.get(goal.metric, 0.0))


async def delete_goal(
    db: AsyncSession, lecture_id: uuid.UUID, goal_id: uuid.UUID
) -> None:
    goal = await _get_owned_goal(db, lecture_id, goal_id)
    await db.delete(goal)
    await db.commit()
