"""교수자 대시보드 서비스 (NestJS DashboardService 포팅)."""
import math
import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.assessment_result import AssessmentResult
from app.models.cost_log import CostLog
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.session import LearningSession


async def get_attendance(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    live_deadline_min: int | None = None,
) -> dict:
    """출석 분석 (실시간 vs 사후 시청).

    live_deadline_min 우선순위:
      1. 호출자가 명시적으로 전달한 값
      2. Lecture.live_deadline_minutes (강의별 설정)
      3. settings.DEFAULT_LIVE_DEADLINE_MINUTES (전역 기본값)
    """
    if live_deadline_min is None:
        lecture_row = await db.get(Lecture, lecture_id)
        if lecture_row is not None and lecture_row.live_deadline_minutes is not None:
            live_deadline_min = lecture_row.live_deadline_minutes
        else:
            live_deadline_min = settings.DEFAULT_LIVE_DEADLINE_MINUTES

    result = await db.execute(
        select(LearningSession)
        .where(LearningSession.lecture_id == lecture_id)
        .options(selectinload(LearningSession.user))
        .order_by(LearningSession.started_at.asc())
    )
    sessions = list(result.scalars().all())

    if not sessions:
        return {"lecture_id": str(lecture_id), "summary": {"total": 0, "live": 0, "vod": 0}, "students": []}

    earliest = min(
        (s.started_at for s in sessions if s.started_at),
        default=sessions[0].created_at,
    )
    live_deadline = earliest + timedelta(minutes=live_deadline_min)

    students = []
    for s in sessions:
        is_live = s.started_at <= live_deadline if s.started_at else False
        students.append({
            "user_id": str(s.user_id),
            "name": s.user.name,
            "student_number": s.user.student_number,
            "type": "live" if is_live else "vod",
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "progress_pct": s.progress_pct,
            "status": s.status.value,
        })

    live = sum(1 for s in students if s["type"] == "live")
    vod = sum(1 for s in students if s["type"] == "vod")

    return {
        "lecture_id": str(lecture_id),
        "live_deadline": live_deadline.isoformat(),
        "summary": {"total": len(students), "live": live, "vod": vod},
        "students": students,
    }


async def get_scores(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """정답률/오답 유형 분석."""
    result = await db.execute(
        select(AssessmentResult)
        .where(AssessmentResult.lecture_id == lecture_id)
    )
    results = list(result.scalars().all())

    if not results:
        return {
            "lecture_id": str(lecture_id),
            "totalQuestions": 0,
            "overallAccuracy": 0,
            "byType": [],
            "byCategory": [],
            "wrongAnswerTop": [],
        }

    total = len(results)
    correct = sum(1 for r in results if r.is_correct)

    # 유형별 정답률
    type_map: dict[str, dict] = {}
    for r in results:
        entry = type_map.setdefault(r.question_type, {"total": 0, "correct": 0})
        entry["total"] += 1
        if r.is_correct:
            entry["correct"] += 1
    by_type = [
        {"type": t, "total": v["total"], "correct": v["correct"],
         "accuracy": round(v["correct"] / v["total"] * 100, 2)}
        for t, v in type_map.items()
    ]

    # 카테고리별 정답률
    cat_map: dict[str, dict] = {}
    for r in results:
        cat = r.category or "uncategorized"
        entry = cat_map.setdefault(cat, {"total": 0, "correct": 0})
        entry["total"] += 1
        if r.is_correct:
            entry["correct"] += 1
    by_category = [
        {"category": c, "total": v["total"], "correct": v["correct"],
         "accuracy": round(v["correct"] / v["total"] * 100, 2)}
        for c, v in cat_map.items()
    ]

    # 오답 빈도 TOP
    wrong_map: dict[str, dict] = {}
    for r in results:
        if r.is_correct:
            continue
        entry = wrong_map.setdefault(r.question_text, {
            "questionText": r.question_text,
            "questionType": r.question_type,
            "wrongCount": 0,
            "wrongAnswers": [],
        })
        entry["wrongCount"] += 1
        if r.user_answer not in entry["wrongAnswers"]:
            entry["wrongAnswers"].append(r.user_answer)

    wrong_top = sorted(wrong_map.values(), key=lambda x: x["wrongCount"], reverse=True)[:10]

    return {
        "lecture_id": str(lecture_id),
        "totalQuestions": total,
        "overallAccuracy": round(correct / total * 100, 2),
        "byType": by_type,
        "byCategory": by_category,
        "wrongAnswerTop": wrong_top,
    }


async def get_engagement(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """참여도 분석 (역질문 반응률, 무반응 기록)."""
    sess_result = await db.execute(
        select(LearningSession)
        .where(LearningSession.lecture_id == lecture_id)
        .options(selectinload(LearningSession.user))
    )
    sessions = list(sess_result.scalars().all())

    qa_result = await db.execute(
        select(QALog).where(QALog.lecture_id == lecture_id)
    )
    qa_logs = list(qa_result.scalars().all())

    total_qa = len(qa_logs)
    responded_qa = sum(1 for q in qa_logs if q.responded)

    # 학생별 참여도
    student_map: dict[uuid.UUID, dict] = {}
    for s in sessions:
        entry = student_map.setdefault(s.user_id, {
            "userId": str(s.user_id),
            "name": s.user.name,
            "student_number": s.user.student_number,
            "qaCount": 0,
            "respondedCount": 0,
            "noResponseCnt": 0,
            "watchedSec": 0,
            "totalSec": 0,
        })
        entry["noResponseCnt"] += s.no_response_cnt
        entry["watchedSec"] += s.watched_sec
        entry["totalSec"] += s.total_sec

    for q in qa_logs:
        entry = student_map.get(q.user_id)
        if not entry:
            continue
        entry["qaCount"] += 1
        if q.responded:
            entry["respondedCount"] += 1

    total_no_response = sum(s.no_response_cnt for s in sessions)

    students = []
    for s in student_map.values():
        s["responseRate"] = round(s["respondedCount"] / s["qaCount"] * 100, 2) if s["qaCount"] > 0 else None
        s["watchRatio"] = round(s["watchedSec"] / s["totalSec"] * 100, 2) if s["totalSec"] > 0 else 0
        students.append(s)

    return {
        "lecture_id": str(lecture_id),
        "summary": {
            "totalStudents": len(sessions),
            "totalQAQuestions": total_qa,
            "overallResponseRate": round(responded_qa / total_qa * 100, 2) if total_qa > 0 else 0,
            "totalNoResponseEvents": total_no_response,
        },
        "students": students,
    }


async def get_qa_logs(
    db: AsyncSession, lecture_id: uuid.UUID, page: int = 1, limit: int = 50
) -> dict:
    """Q&A 로그 조회 (페이지네이션)."""
    offset = (page - 1) * limit

    count_result = await db.execute(
        select(func.count()).select_from(QALog).where(QALog.lecture_id == lecture_id)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(QALog)
        .where(QALog.lecture_id == lecture_id)
        .order_by(QALog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    logs = list(result.scalars().all())

    return {
        "lecture_id": str(lecture_id),
        "page": page,
        "limit": limit,
        "totalCount": total,
        "totalPages": math.ceil(total / limit) if limit > 0 else 0,
        "logs": [
            {
                "id": str(log.id),
                "question": log.question,
                "answer": log.answer,
                "in_scope": log.in_scope,
                "responded": log.responded,
                "cost_usd": log.cost_usd,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


async def get_cost(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """비용 미터 (CostLog 합산)."""
    result = await db.execute(
        select(CostLog)
        .where(CostLog.lecture_id == lecture_id)
        .order_by(CostLog.created_at.desc())
    )
    costs = list(result.scalars().all())

    by_category_map: dict[str, dict] = {}
    total_input = total_output = 0
    total_cost = 0.0

    for c in costs:
        total_input += c.input_tokens
        total_output += c.output_tokens
        total_cost += c.cost_usd

        entry = by_category_map.setdefault(c.category.value, {
            "category": c.category.value,
            "inputTokens": 0,
            "outputTokens": 0,
            "costUsd": 0.0,
            "count": 0,
        })
        entry["inputTokens"] += c.input_tokens
        entry["outputTokens"] += c.output_tokens
        entry["costUsd"] += c.cost_usd
        entry["count"] += 1

    by_category = [
        {**e, "costUsd": round(e["costUsd"], 6)}
        for e in by_category_map.values()
    ]

    return {
        "lecture_id": str(lecture_id),
        "summary": {
            "totalRequests": len(costs),
            "totalInputTokens": total_input,
            "totalOutputTokens": total_output,
            "totalCostUsd": round(total_cost, 6),
        },
        "byCategory": by_category,
    }
