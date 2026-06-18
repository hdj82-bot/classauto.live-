"""베타 운영자 콘솔 집계 (스펙 13 · A·B·D 공용 단일 출처).

비용은 두 테이블에 분산돼 있다:
  - ``render_cost_logs`` → ``video_renders.instructor_id`` (교수자 1-조인 직결)
  - ``platform_cost_logs`` (LLM/STT/TTS 등) → ``lectures`` → ``courses.instructor_id``
이 모듈이 둘을 통합해 교수자 단위 지출·롤업·퍼널을 만든다. ``/api/v1/admin``
엔드포인트(beta-overview, costs, funnel, users/{id}/usage)가 이를 공유한다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import case, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_log import CostLog
from app.models.course import Course
from app.models.invite import ProfessorInvite
from app.models.lecture import Lecture
from app.models.session import LearningSession
from app.models.user import User, UserRole
from app.models.video_render import RenderCostLog, VideoRender


def _month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ── 비용: 교수자별 통합 ───────────────────────────────────────────────────────


async def spend_by_instructor(
    db: AsyncSession, since: datetime | None = None
) -> dict[uuid.UUID, float]:
    """교수자별 통합 지출(USD). render + platform 두 테이블 합산.

    ``since`` 가 주어지면 그 시각 이후 비용만 집계한다(이번 달 지출 등).
    """
    out: dict[uuid.UUID, float] = {}

    # 1) 렌더 비용: render_cost_logs → video_renders.instructor_id (직결)
    # FROM 을 RenderCostLog 로 명시 — instructor_id 를 select 하면서 VideoRender 를
    # join 하므로 select_from 이 없으면 VideoRender 가 FROM 에 중복돼 모호해진다.
    r = (
        select(
            VideoRender.instructor_id,
            func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0),
        )
        .select_from(RenderCostLog)
        .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id)
        .group_by(VideoRender.instructor_id)
    )
    if since is not None:
        r = r.where(RenderCostLog.created_at >= since)

    # 2) 플랫폼 비용: platform_cost_logs → lectures → courses.instructor_id
    p = (
        select(
            Course.instructor_id,
            func.coalesce(func.sum(CostLog.cost_usd), 0.0),
        )
        .select_from(CostLog)
        .join(Lecture, CostLog.lecture_id == Lecture.id)
        .join(Course, Lecture.course_id == Course.id)
        .group_by(Course.instructor_id)
    )
    if since is not None:
        p = p.where(CostLog.created_at >= since)

    for iid, cost in (await db.execute(r)).all():
        if iid is not None:
            out[iid] = out.get(iid, 0.0) + float(cost or 0.0)
    for iid, cost in (await db.execute(p)).all():
        if iid is not None:
            out[iid] = out.get(iid, 0.0) + float(cost or 0.0)
    return out


async def _active_months_by_instructor(
    db: AsyncSession,
) -> dict[uuid.UUID, set[tuple[int, int]]]:
    """교수자별 '지출이 발생한 distinct (year, month)' 집합 — 월평균 분모용."""
    out: dict[uuid.UUID, set[tuple[int, int]]] = {}

    r = (
        select(
            VideoRender.instructor_id,
            extract("year", RenderCostLog.created_at),
            extract("month", RenderCostLog.created_at),
        )
        .select_from(RenderCostLog)
        .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id)
        .where(RenderCostLog.cost_usd > 0)
        .distinct()
    )
    p = (
        select(
            Course.instructor_id,
            extract("year", CostLog.created_at),
            extract("month", CostLog.created_at),
        )
        .select_from(CostLog)
        .join(Lecture, CostLog.lecture_id == Lecture.id)
        .join(Course, Lecture.course_id == Course.id)
        .where(CostLog.cost_usd > 0)
        .distinct()
    )
    for iid, y, m in (await db.execute(r)).all():
        if iid is not None and y is not None and m is not None:
            out.setdefault(iid, set()).add((int(y), int(m)))
    for iid, y, m in (await db.execute(p)).all():
        if iid is not None and y is not None and m is not None:
            out.setdefault(iid, set()).add((int(y), int(m)))
    return out


# ── A: 교수자별 롤업 ──────────────────────────────────────────────────────────


def _max_dt(a: datetime | None, b: datetime | None) -> datetime | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if a >= b else b


async def instructor_rollup(
    db: AsyncSession, cohort: str | None = None, now: datetime | None = None
) -> list[dict]:
    """교수자(role==professor)별 사용량·지출 롤업.

    각 항목: id, email, name, cohort, last_active_at, courses_count,
    lectures_count, published_lectures_count, renders_count,
    spend_this_month_usd, spend_total_usd, spend_monthly_avg_usd.
    """
    prof_stmt = select(User).where(User.role == UserRole.professor)
    if cohort:
        prof_stmt = prof_stmt.where(User.cohort == cohort)
    professors = list((await db.execute(prof_stmt)).scalars().all())
    if not professors:
        return []

    # 강의/강좌 카운트 (courses → lectures)
    courses_count: dict[uuid.UUID, int] = {}
    for iid, cnt in (
        await db.execute(
            select(Course.instructor_id, func.count(Course.id)).group_by(
                Course.instructor_id
            )
        )
    ).all():
        if iid is not None:
            courses_count[iid] = int(cnt or 0)

    lectures_count: dict[uuid.UUID, int] = {}
    published_count: dict[uuid.UUID, int] = {}
    for iid, total, published in (
        await db.execute(
            select(
                Course.instructor_id,
                func.count(Lecture.id),
                func.coalesce(
                    func.sum(case((Lecture.is_published == True, 1), else_=0)), 0  # noqa: E712
                ),
            )
            .select_from(Course)
            .join(Lecture, Lecture.course_id == Course.id)
            .group_by(Course.instructor_id)
        )
    ).all():
        if iid is not None:
            lectures_count[iid] = int(total or 0)
            published_count[iid] = int(published or 0)

    renders_count: dict[uuid.UUID, int] = {}
    last_render: dict[uuid.UUID, datetime] = {}
    for iid, cnt, last in (
        await db.execute(
            select(
                VideoRender.instructor_id,
                func.count(VideoRender.id),
                func.max(VideoRender.created_at),
            ).group_by(VideoRender.instructor_id)
        )
    ).all():
        if iid is not None:
            renders_count[iid] = int(cnt or 0)
            last_render[iid] = last

    last_lecture_update: dict[uuid.UUID, datetime] = {}
    for iid, last in (
        await db.execute(
            select(Course.instructor_id, func.max(Lecture.updated_at))
            .select_from(Course)
            .join(Lecture, Lecture.course_id == Course.id)
            .group_by(Course.instructor_id)
        )
    ).all():
        if iid is not None:
            last_lecture_update[iid] = last

    spend_total = await spend_by_instructor(db)
    spend_month = await spend_by_instructor(db, since=_month_start(now))
    active_months = await _active_months_by_instructor(db)

    rows: list[dict] = []
    for u in professors:
        total = spend_total.get(u.id, 0.0)
        n_months = len(active_months.get(u.id, set()))
        avg = (total / n_months) if n_months > 0 else 0.0
        last_active = _max_dt(last_render.get(u.id), last_lecture_update.get(u.id))
        rows.append(
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "cohort": u.cohort,
                "last_active_at": last_active.isoformat() if last_active else None,
                "courses_count": courses_count.get(u.id, 0),
                "lectures_count": lectures_count.get(u.id, 0),
                "published_lectures_count": published_count.get(u.id, 0),
                "renders_count": renders_count.get(u.id, 0),
                "spend_this_month_usd": round(spend_month.get(u.id, 0.0), 4),
                "spend_total_usd": round(total, 4),
                "spend_monthly_avg_usd": round(avg, 4),
            }
        )
    # 지출 큰 순 → 활동 많은 순으로 정렬(운영자 관심 우선).
    rows.sort(key=lambda r: (r["spend_total_usd"], r["renders_count"]), reverse=True)
    return rows


async def instructor_monthly_spend(
    db: AsyncSession, instructor_id: uuid.UUID
) -> list[dict]:
    """단일 교수자의 월별 통합 지출 시계열 — 드릴다운(A)용. 최신순."""
    months: dict[tuple[int, int], float] = {}

    rm = (
        select(
            extract("year", RenderCostLog.created_at),
            extract("month", RenderCostLog.created_at),
            func.sum(RenderCostLog.cost_usd),
        )
        .select_from(RenderCostLog)
        .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id)
        .where(VideoRender.instructor_id == instructor_id)
        .group_by(
            extract("year", RenderCostLog.created_at),
            extract("month", RenderCostLog.created_at),
        )
    )
    pm = (
        select(
            extract("year", CostLog.created_at),
            extract("month", CostLog.created_at),
            func.sum(CostLog.cost_usd),
        )
        .select_from(CostLog)
        .join(Lecture, CostLog.lecture_id == Lecture.id)
        .join(Course, Lecture.course_id == Course.id)
        .where(Course.instructor_id == instructor_id)
        .group_by(
            extract("year", CostLog.created_at),
            extract("month", CostLog.created_at),
        )
    )
    for y, m, cost in (await db.execute(rm)).all():
        if y is not None and m is not None:
            months[(int(y), int(m))] = months.get((int(y), int(m)), 0.0) + float(cost or 0.0)
    for y, m, cost in (await db.execute(pm)).all():
        if y is not None and m is not None:
            months[(int(y), int(m))] = months.get((int(y), int(m)), 0.0) + float(cost or 0.0)

    series = [
        {"year": y, "month": m, "cost_usd": round(v, 4)} for (y, m), v in months.items()
    ]
    series.sort(key=lambda x: (x["year"], x["month"]), reverse=True)
    return series


# ── B: 비용 분해 (render + platform 통합) ─────────────────────────────────────


async def spend_breakdown(
    db: AsyncSession, since: datetime | None = None, month_limit: int = 12
) -> dict:
    """두 비용 테이블 통합 분해 — /api/v1/admin/costs 용.

    반환:
      - total_cost_usd: render + platform 합
      - by_service: [{source, name, cost_usd}] (render=service별, platform=category별)
      - by_month:    [{year, month, cost_usd}] 두 테이블 합, 최신순 month_limit 개
    """
    # by_service — render (service별)
    rs = select(RenderCostLog.service, func.sum(RenderCostLog.cost_usd))
    if since is not None:
        rs = rs.where(RenderCostLog.created_at >= since)
    rs = rs.group_by(RenderCostLog.service)

    # by_service — platform (category별)
    ps = select(CostLog.category, func.sum(CostLog.cost_usd))
    if since is not None:
        ps = ps.where(CostLog.created_at >= since)
    ps = ps.group_by(CostLog.category)

    by_service: list[dict] = []
    total = 0.0
    for name, cost in (await db.execute(rs)).all():
        c = float(cost or 0.0)
        total += c
        by_service.append({"source": "render", "name": name, "cost_usd": round(c, 4)})
    for cat, cost in (await db.execute(ps)).all():
        c = float(cost or 0.0)
        total += c
        # category 는 Enum(CostCategory) 일 수 있어 value 로 정규화.
        name = cat.value if hasattr(cat, "value") else str(cat)
        by_service.append({"source": "platform", "name": name, "cost_usd": round(c, 4)})
    by_service.sort(key=lambda x: x["cost_usd"], reverse=True)

    # by_month — 두 테이블 (year, month) 별 합산
    months: dict[tuple[int, int], float] = {}

    rm = select(
        extract("year", RenderCostLog.created_at),
        extract("month", RenderCostLog.created_at),
        func.sum(RenderCostLog.cost_usd),
    )
    if since is not None:
        rm = rm.where(RenderCostLog.created_at >= since)
    rm = rm.group_by(
        extract("year", RenderCostLog.created_at),
        extract("month", RenderCostLog.created_at),
    )

    pm = select(
        extract("year", CostLog.created_at),
        extract("month", CostLog.created_at),
        func.sum(CostLog.cost_usd),
    )
    if since is not None:
        pm = pm.where(CostLog.created_at >= since)
    pm = pm.group_by(
        extract("year", CostLog.created_at),
        extract("month", CostLog.created_at),
    )

    for y, m, cost in (await db.execute(rm)).all():
        if y is not None and m is not None:
            months[(int(y), int(m))] = months.get((int(y), int(m)), 0.0) + float(cost or 0.0)
    for y, m, cost in (await db.execute(pm)).all():
        if y is not None and m is not None:
            months[(int(y), int(m))] = months.get((int(y), int(m)), 0.0) + float(cost or 0.0)

    by_month = [
        {"year": y, "month": m, "cost_usd": round(v, 4)}
        for (y, m), v in months.items()
    ]
    by_month.sort(key=lambda x: (x["year"], x["month"]), reverse=True)
    by_month = by_month[:month_limit]

    return {
        "total_cost_usd": round(total, 4),
        "by_service": by_service,
        "by_month": by_month,
    }


# ── D: 활성화 퍼널 ────────────────────────────────────────────────────────────


async def funnel(db: AsyncSession, cohort: str | None = None) -> dict:
    """베타 활성화 퍼널 5단계 + 단계별 전이율(%).

    1) invited           : professor_invites 수
    2) signed_up         : used_at IS NOT NULL (초대→가입 연결)
    3) created_course    : 강좌를 만든 교수자 수 (distinct)
    4) published_lecture : 발행 강의 보유 교수자 수 (distinct)
    5) ran_student_session: 학생 세션이 한 번이라도 돈 교수자 수 (distinct)
    """
    # 1) invited
    inv_stmt = select(func.count()).select_from(ProfessorInvite)
    su_stmt = select(func.count()).select_from(ProfessorInvite).where(
        ProfessorInvite.used_at.isnot(None)
    )
    if cohort:
        inv_stmt = inv_stmt.where(ProfessorInvite.cohort == cohort)
        su_stmt = su_stmt.where(ProfessorInvite.cohort == cohort)
    invited = (await db.execute(inv_stmt)).scalar() or 0
    signed_up = (await db.execute(su_stmt)).scalar() or 0

    # 3) created_course — 강좌 보유 교수자(distinct). cohort 면 users.cohort 로 필터.
    cc_stmt = (
        select(func.count(func.distinct(Course.instructor_id)))
        .select_from(Course)
        .join(User, User.id == Course.instructor_id)
        .where(User.role == UserRole.professor)
    )
    # 4) published_lecture — 발행 강의 보유 교수자(distinct)
    pl_stmt = (
        select(func.count(func.distinct(Course.instructor_id)))
        .select_from(Course)
        .join(Lecture, Lecture.course_id == Course.id)
        .join(User, User.id == Course.instructor_id)
        .where(User.role == UserRole.professor, Lecture.is_published == True)  # noqa: E712
    )
    # 5) ran_student_session — 학생 세션이 돈 강의를 가진 교수자(distinct)
    ss_stmt = (
        select(func.count(func.distinct(Course.instructor_id)))
        .select_from(LearningSession)
        .join(Lecture, Lecture.id == LearningSession.lecture_id)
        .join(Course, Course.id == Lecture.course_id)
        .join(User, User.id == Course.instructor_id)
        .where(User.role == UserRole.professor)
    )
    if cohort:
        cc_stmt = cc_stmt.where(User.cohort == cohort)
        pl_stmt = pl_stmt.where(User.cohort == cohort)
        ss_stmt = ss_stmt.where(User.cohort == cohort)

    created_course = (await db.execute(cc_stmt)).scalar() or 0
    published_lecture = (await db.execute(pl_stmt)).scalar() or 0
    ran_student_session = (await db.execute(ss_stmt)).scalar() or 0

    steps = [
        {"step": "invited", "count": int(invited)},
        {"step": "signed_up", "count": int(signed_up)},
        {"step": "created_course", "count": int(created_course)},
        {"step": "published_lecture", "count": int(published_lecture)},
        {"step": "ran_student_session", "count": int(ran_student_session)},
    ]
    # 각 단계 전이율(직전 단계 대비 %). 첫 단계는 100%.
    for i, s in enumerate(steps):
        if i == 0:
            s["conversion_from_prev_pct"] = 100.0 if s["count"] > 0 else 0.0
        else:
            prev = steps[i - 1]["count"]
            s["conversion_from_prev_pct"] = (
                round(s["count"] / prev * 100, 1) if prev > 0 else 0.0
            )
    return {"steps": steps}
