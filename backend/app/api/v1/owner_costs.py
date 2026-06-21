"""계정주(운영자) 전용 — API 비용 대시보드.

``ADMIN_EMAILS`` 의 이메일(예: classauto101@gmail.com) 또는 admin 역할만
접근한다(``require_owner``). 베타테스터(교수자)별 외부 API 사용 비용을
종목(서비스)별로 집계하고, 전체 합산·월별 추이를 함께 제공한다.

비용 출처 — **현재 DB 에 영속화되는 것만** 집계한다:
  - ``render_cost_logs``: HeyGen 렌더 / ElevenLabs·Google TTS 합성 비용.
    ``video_renders.instructor_id`` 로 교수자에게 귀속.
  - ``qa_logs``: 학생 RAG Q&A 의 Claude 비용. ``lectures → courses.instructor_id``
    로 (강의 소유) 교수자에게 귀속. 서비스 라벨은 ``claude_qa``.

아직 영속화되지 않는 비용(슬라이드 스크립트 생성 Claude·OpenAI 이미지 생성 등)은
잡히지 않는다. 그 비용이 ``render_cost_logs`` 에 기록되기 시작하면 ``service``
라벨 기준으로 본 대시보드에 **자동 노출**된다(데이터 주도 설계 — 새 종목을
추가해도 이 파일을 고칠 필요가 없다).

성능: 모든 집계에 ``created_at >= now - 365d`` 윈도우를 적용해 입력 행 수를
제한한다. ``ix_render_cost_logs_created_at``(0014) 와 ``qa_logs(created_at)``
가 시간 필터를 백킹. 운영자 전용·저빈도 화면이라 캐시는 두지 않는다(요청마다
fresh — "실시간" 요건).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.db.session import get_db
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.user import User
from app.models.video_render import RenderCostLog, VideoRender

owner_costs_router = APIRouter(prefix="/api/owner/costs", tags=["owner"])

# 비용 집계 윈도우 — admin.get_costs(COSTS_WINDOW_DAYS) 와 동일하게 최근 12개월.
COSTS_WINDOW_DAYS = 365

# 학생 RAG Q&A(Claude) 비용의 서비스 라벨. render_cost_logs 의 service 값
# (heygen/elevenlabs/google_tts/...) 과 겹치지 않는 별도 종목으로 노출한다.
QA_SERVICE_LABEL = "claude_qa"


def _month_start(now: datetime) -> datetime:
    """이번 달 1일 00:00:00 UTC — 당월 누적(month-to-date) 경계."""
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@owner_costs_router.get("")
async def get_owner_costs(
    _owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """전체 + 사용자(교수자)별 API 비용 집계 (최근 12개월).

    반환:
      - ``total_cost_usd`` / ``month_to_date_usd``: 전체 합산 / 당월 누적.
      - ``by_service``: 종목별 합계(비용·호출수·초/토큰 사용량). 비용 내림차순.
      - ``services``: 사용자 표의 컬럼 집합(종목 키, 비용 내림차순).
      - ``by_month``: 월별 합계(최근 12개), 최신순.
      - ``by_user``: 교수자별 — 종목별 비용 맵 + 총액. 총액 내림차순.
    """
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=COSTS_WINDOW_DAYS)
    month_start = _month_start(now)

    # ── 1. render_cost_logs: (instructor, service) 별 비용·초·호출수 ──
    render_rows = (
        await db.execute(
            select(
                VideoRender.instructor_id.label("user_id"),
                RenderCostLog.service.label("service"),
                func.sum(RenderCostLog.cost_usd).label("cost"),
                func.sum(RenderCostLog.duration_seconds).label("seconds"),
                func.count().label("calls"),
            )
            .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id)
            .where(RenderCostLog.created_at >= start_date)
            .group_by(VideoRender.instructor_id, RenderCostLog.service)
        )
    ).all()

    # ── 2. qa_logs: instructor 별 Claude Q&A 비용·토큰·호출수 ──
    #    qa_logs.user_id 는 질문한 학생이지만, 비용 귀속은 강의를 소유한 교수자.
    qa_rows = (
        await db.execute(
            select(
                Course.instructor_id.label("user_id"),
                func.sum(QALog.cost_usd).label("cost"),
                func.sum(QALog.input_tokens + QALog.output_tokens).label("tokens"),
                func.count().label("calls"),
            )
            .join(Lecture, QALog.lecture_id == Lecture.id)
            .join(Course, Lecture.course_id == Course.id)
            .where(QALog.created_at >= start_date)
            .group_by(Course.instructor_id)
        )
    ).all()

    # ── 3. 종목(서비스)별 플랫폼 합계 ──
    service_agg: dict[str, dict] = {}
    for r in render_rows:
        s = service_agg.setdefault(
            r.service, {"cost_usd": 0.0, "calls": 0, "seconds": 0.0, "tokens": 0}
        )
        s["cost_usd"] += float(r.cost or 0)
        s["calls"] += int(r.calls or 0)
        s["seconds"] += float(r.seconds or 0)
    for r in qa_rows:
        s = service_agg.setdefault(
            QA_SERVICE_LABEL, {"cost_usd": 0.0, "calls": 0, "seconds": 0.0, "tokens": 0}
        )
        s["cost_usd"] += float(r.cost or 0)
        s["calls"] += int(r.calls or 0)
        s["tokens"] += int(r.tokens or 0)

    by_service = [
        {
            "service": name,
            "cost_usd": round(v["cost_usd"], 4),
            "calls": v["calls"],
            "seconds": round(v["seconds"], 1) if v["seconds"] else 0.0,
            "tokens": v["tokens"],
        }
        for name, v in service_agg.items()
    ]
    by_service.sort(key=lambda x: x["cost_usd"], reverse=True)
    services = [row["service"] for row in by_service]
    total_cost = sum(v["cost_usd"] for v in service_agg.values())

    # ── 4. 사용자(교수자)별 — 종목별 비용 맵 + 총액 ──
    user_agg: dict[str, dict] = {}

    def _user_slot(uid) -> dict:
        key = str(uid)
        return user_agg.setdefault(
            key, {"total_usd": 0.0, "by_service": {}, "calls": 0}
        )

    for r in render_rows:
        if r.user_id is None:  # instructor 가 SET NULL 로 비워진 고아 렌더
            continue
        slot = _user_slot(r.user_id)
        cost = float(r.cost or 0)
        slot["by_service"][r.service] = round(
            slot["by_service"].get(r.service, 0.0) + cost, 4
        )
        slot["total_usd"] += cost
        slot["calls"] += int(r.calls or 0)
    for r in qa_rows:
        if r.user_id is None:
            continue
        slot = _user_slot(r.user_id)
        cost = float(r.cost or 0)
        slot["by_service"][QA_SERVICE_LABEL] = round(
            slot["by_service"].get(QA_SERVICE_LABEL, 0.0) + cost, 4
        )
        slot["total_usd"] += cost
        slot["calls"] += int(r.calls or 0)

    # 사용자 메타(email/name/role) 일괄 조회
    user_meta: dict[str, User] = {}
    if user_agg:
        import uuid as _uuid

        ids = [_uuid.UUID(k) for k in user_agg]
        meta_rows = (
            await db.execute(select(User).where(User.id.in_(ids)))
        ).scalars().all()
        user_meta = {str(u.id): u for u in meta_rows}

    by_user = []
    for uid, v in user_agg.items():
        u = user_meta.get(uid)
        by_user.append(
            {
                "user_id": uid,
                "email": u.email if u else None,
                "name": u.name if u else None,
                "role": u.role.value if u else None,
                "total_usd": round(v["total_usd"], 4),
                "calls": v["calls"],
                "by_service": v["by_service"],
            }
        )
    by_user.sort(key=lambda x: x["total_usd"], reverse=True)

    # ── 5. 월별 합계(render + qa 병합), 최신 12개 ──
    by_month = await _by_month(db, start_date)

    # ── 6. 당월 누적(month-to-date) ──
    mtd_render = (
        await db.execute(
            select(func.sum(RenderCostLog.cost_usd)).where(
                RenderCostLog.created_at >= month_start
            )
        )
    ).scalar() or 0
    mtd_qa = (
        await db.execute(
            select(func.sum(QALog.cost_usd)).where(QALog.created_at >= month_start)
        )
    ).scalar() or 0

    return {
        "generated_at": now.isoformat(),
        "window_days": COSTS_WINDOW_DAYS,
        "currency": "USD",
        "total_cost_usd": round(total_cost, 4),
        "month_to_date_usd": round(float(mtd_render) + float(mtd_qa), 4),
        "user_count": len(by_user),
        "services": services,
        "by_service": by_service,
        "by_month": by_month,
        "by_user": by_user,
    }


async def _by_month(db: AsyncSession, start_date: datetime) -> list[dict]:
    """월별(render + qa) 비용 합계 — 최신순 최대 12개.

    render_cost_logs 와 qa_logs 를 각각 (year, month) 로 GROUP BY 한 뒤
    파이썬에서 병합한다(두 테이블을 SQL UNION 하는 것보다 단순·이식성↑).
    """
    render_m = (
        await db.execute(
            select(
                extract("year", RenderCostLog.created_at).label("year"),
                extract("month", RenderCostLog.created_at).label("month"),
                func.sum(RenderCostLog.cost_usd).label("total"),
            )
            .where(RenderCostLog.created_at >= start_date)
            .group_by("year", "month")
        )
    ).all()
    qa_m = (
        await db.execute(
            select(
                extract("year", QALog.created_at).label("year"),
                extract("month", QALog.created_at).label("month"),
                func.sum(QALog.cost_usd).label("total"),
            )
            .where(QALog.created_at >= start_date)
            .group_by("year", "month")
        )
    ).all()

    merged: dict[tuple[int, int], float] = {}
    for r in (*render_m, *qa_m):
        key = (int(r.year), int(r.month))
        merged[key] = merged.get(key, 0.0) + float(r.total or 0)

    rows = [
        {"year": y, "month": m, "cost_usd": round(c, 4)}
        for (y, m), c in merged.items()
    ]
    rows.sort(key=lambda x: (x["year"], x["month"]), reverse=True)
    return rows[:12]
