"""교수자 대시보드 서비스 (NestJS DashboardService 포팅)."""
import math
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.assessment_result import AssessmentResult
from app.models.cost_log import CostLog
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.session import LearningSession
from app.services.insights.models import (
    SlideEngagement,
    WatchEvent,
    WatchEventType,
)


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
        # 재생 구간 히트맵 raw (G1) — 프론트 분석 페이지가 body.slides 를 감지하면
        # WatchHeatmap 컴포넌트를 자동 활성화한다(types.ts WatchHeatmapData).
        "slides": await aggregate_watch_slides(db, lecture_id),
    }


# ── 재생 구간 히트맵 (watch_events 집계, G1) ──────────────────────────────────
#
# docs/planning/10-research-data-model.md §3.1·§3.2, 11-analytics-dashboard.md §F.
# 베타 규모(교수 5~15·학생 수백)에선 원시 이벤트를 파이썬에서 1패스 집계해도
# 무리 없다(get_attendance/get_engagement 와 동일 전략). 스케일 시 slide_engagement
# 롤업으로 옮긴다.


def _summarize_watch_events(events: list[WatchEvent]) -> list[dict]:
    """watch_events 리스트 → 슬라이드별 {index, replays, drops, dwellSec, completionPct}.

    정의(베타·해석 가능성 우선):
    - replays  = 명시적 rewatch 이벤트 수 + max(0, 슬라이드 진입 수 − 진입 세션 수)
                 (같은 학생이 한 슬라이드를 다시 진입 = 재시청)
    - drops    = max(0, 진입 수 − 완료 수)  (진입했으나 완료 못 한 횟수 = 이탈)
    - dwellSec = 클라이언트가 meta.dwell_seconds 로 보낸 체류 합(없으면 0)
    - completionPct = 완료/진입 × 100
    """
    # slide_index → 누적 카운터
    agg: dict[int, dict] = {}
    # (slide_index) → 진입한 distinct session 집합
    enter_sessions: dict[int, set] = {}

    for ev in events:
        idx = ev.slide_index
        if idx is None:
            continue
        a = agg.setdefault(
            idx,
            {"enters": 0, "completes": 0, "rewatches": 0, "dwell": 0.0},
        )
        if ev.event_type == WatchEventType.segment_enter:
            a["enters"] += 1
            enter_sessions.setdefault(idx, set()).add(ev.session_id)
        elif ev.event_type == WatchEventType.segment_complete:
            a["completes"] += 1
        elif ev.event_type == WatchEventType.rewatch:
            a["rewatches"] += 1
        # 클라이언트가 체류시간을 함께 보낸 경우(어느 이벤트든) 합산.
        if ev.meta and isinstance(ev.meta, dict):
            dwell = ev.meta.get("dwell_seconds")
            if isinstance(dwell, (int, float)) and dwell > 0:
                a["dwell"] += float(dwell)

    slides: list[dict] = []
    for idx in sorted(agg.keys()):
        a = agg[idx]
        distinct = len(enter_sessions.get(idx, set()))
        replays = a["rewatches"] + max(0, a["enters"] - distinct)
        drops = max(0, a["enters"] - a["completes"])
        completion = round(a["completes"] / a["enters"] * 100, 2) if a["enters"] else 0.0
        slides.append({
            "index": idx,
            "replays": replays,
            "drops": drops,
            "durationSec": round(a["dwell"], 1),
            "completionPct": completion,
        })
    return slides


async def aggregate_watch_slides(db: AsyncSession, lecture_id: uuid.UUID) -> list[dict]:
    """강의의 watch_events 를 슬라이드별로 집계한 raw 리스트 반환."""
    result = await db.execute(
        select(WatchEvent).where(WatchEvent.lecture_id == lecture_id)
    )
    return _summarize_watch_events(list(result.scalars().all()))


async def get_watch_heatmap(db: AsyncSession, lecture_id: uuid.UUID) -> dict:
    """재생 구간 히트맵 — 프론트 WatchHeatmapData 모양({lecture_id, slides})."""
    return {
        "lecture_id": str(lecture_id),
        "slides": await aggregate_watch_slides(db, lecture_id),
    }


async def ingest_watch_events(
    db: AsyncSession,
    *,
    session: LearningSession,
    events: list[dict],
) -> int:
    """슬라이드쇼 플레이어가 배치 전송한 재생 이벤트를 append.

    세션 소유권(user_id·lecture_id)은 호출자(라우터)가 검증한 ``session`` 에서
    가져오므로 클라이언트가 보낸 값으로 위조할 수 없다. 알 수 없는 event_type 은
    건너뛴다(전방호환). 반환값 = 적재된 이벤트 수.
    """
    inserted = 0
    for raw in events:
        type_str = str(raw.get("event_type", "")).strip()
        try:
            event_type = WatchEventType(type_str)
        except ValueError:
            continue  # 미지의 타입은 무시(클라이언트 버전 스큐 허용)
        slide_index = raw.get("slide_index")
        client_ts_raw = raw.get("client_ts")
        client_ts: datetime | None = None
        if isinstance(client_ts_raw, str) and client_ts_raw:
            try:
                client_ts = datetime.fromisoformat(client_ts_raw.replace("Z", "+00:00"))
            except ValueError:
                client_ts = None
        meta = raw.get("meta")
        db.add(
            WatchEvent(
                session_id=session.id,
                user_id=session.user_id,
                lecture_id=session.lecture_id,
                event_type=event_type,
                slide_index=int(slide_index) if slide_index is not None else None,
                position_seconds=float(raw.get("position_seconds", 0) or 0),
                from_position_seconds=(
                    float(raw["from_position_seconds"])
                    if raw.get("from_position_seconds") is not None
                    else None
                ),
                playback_rate=(
                    float(raw["playback_rate"])
                    if raw.get("playback_rate") is not None
                    else None
                ),
                client_ts=client_ts,
                meta=meta if isinstance(meta, dict) else None,
            )
        )
        inserted += 1
    await db.commit()
    return inserted


async def rollup_slide_engagement(db: AsyncSession, lecture_id: uuid.UUID) -> list[dict]:
    """watch_events → slide_engagement 강의 전체 집계행(session_id=NULL) 재계산.

    멱등 upsert(기존 강의 전체행 삭제 후 재삽입). 보고서 생성 시 호출해 재현 가능한
    스냅샷을 남긴다(class_briefings.source_window 와 함께 재현성 확보, 11 §5).
    학생별 행(session_id 有)은 베타 단계에서 생성하지 않는다(전체행만).
    """
    slides = await aggregate_watch_slides(db, lecture_id)
    # 기존 강의 전체 집계행만 삭제(학생별 행은 건드리지 않음).
    await db.execute(
        delete(SlideEngagement).where(
            SlideEngagement.lecture_id == lecture_id,
            SlideEngagement.session_id.is_(None),
        )
    )
    for s in slides:
        db.add(
            SlideEngagement(
                lecture_id=lecture_id,
                slide_index=s["index"],
                session_id=None,
                dwell_seconds=s["durationSec"],
                rewatch_count=s["replays"],
                drop_count=s["drops"],
                avg_completion_pct=s["completionPct"],
            )
        )
    await db.commit()
    return slides


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
