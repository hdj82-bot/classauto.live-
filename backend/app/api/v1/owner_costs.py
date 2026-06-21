"""계정주(운영자) 전용 — API 비용 대시보드.

``ADMIN_EMAILS`` 의 이메일(예: classauto101@gmail.com) 또는 admin 역할만
접근한다(``require_owner``). 베타테스터(교수자)별 외부 API 사용 비용을
종목(서비스)별로 집계하고, 전체 합산·월별 추이를 함께 제공한다.

비용 출처 — **DB 에 영속화되는 세 테이블을 모두 통합**한다(서로 겹치지 않음):
  - ``render_cost_logs``: 강의 영상 렌더(HeyGen) · TTS(ElevenLabs/Google) 합성.
    ``video_renders.instructor_id`` 로 교수자 귀속.
  - ``qa_logs``: 학생 RAG Q&A 의 Claude 비용. ``lectures → courses.instructor_id``.
  - ``platform_cost_logs``: Q&A 아바타 렌더(HeyGen/**VisionStory**) · 소크라테스
    퀴즈 · 인사이트 브리핑(Claude). ``lectures → courses.instructor_id``.

각 행의 종목(서비스) 라벨은 **벤더 기준**으로 정규화한다 — heygen / elevenlabs /
google_tts / visionstory / claude / openai. 같은 벤더의 호출은 한 종목으로 합산된다.

아직 영속화되지 않는 비용(gpt-image 아바타 룩 생성·음성 클론·슬라이드 스크립트
생성 Claude·임베딩 등)은 잡히지 않는다. 해당 호출부에 비용 기록을 추가하면
같은 벤더 라벨로 본 대시보드에 자동 합류한다(데이터 주도 설계).

성능: 모든 집계에 ``created_at >= now - 365d`` 윈도우를 적용. 운영자 전용·저빈도
화면이라 캐시는 두지 않는다(요청마다 fresh — "실시간"). 환율(원/달러)은 프론트가
당일 시세를 별도로 조회해 표기한다(백엔드는 USD 원장만 책임).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.db.session import get_db
from app.models.cost_log import CostLog
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.user import User
from app.models.video_render import RenderCostLog, VideoRender

owner_costs_router = APIRouter(prefix="/api/owner/costs", tags=["owner"])

# 비용 집계 윈도우 — admin.get_costs(COSTS_WINDOW_DAYS) 와 동일하게 최근 12개월.
COSTS_WINDOW_DAYS = 365


def _platform_service(category, model: str | None) -> str:
    """platform_cost_logs 의 (category, model) 을 벤더 종목 라벨로 정규화.

    - AVATAR_QA: Q&A 아바타 렌더. model 이 곧 벤더("visionstory"/"heygen").
    - LLM_*: Claude 호출(Q&A/평가/요약) → "claude".
    - TTS/STT/OTHER: 현재 platform 에 거의 안 쌓이지만 폴백 처리.
    """
    cat = getattr(category, "value", category)  # SAEnum → str
    if cat == "AVATAR_QA":
        return (model or "heygen").strip().lower()
    if cat in ("LLM_QA", "LLM_ASSESSMENT", "LLM_SUMMARY"):
        return "claude"
    if cat == "TTS":
        return (model or "tts").strip().lower()
    if cat == "STT":
        return "stt"
    return "other"


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

    # 종목별 플랫폼 합계 / 사용자별 누적기.
    service_agg: dict[str, dict] = {}
    user_agg: dict[str, dict] = {}

    def _service_slot(name: str) -> dict:
        return service_agg.setdefault(
            name, {"cost_usd": 0.0, "calls": 0, "seconds": 0.0, "tokens": 0}
        )

    def _user_slot(uid) -> dict:
        return user_agg.setdefault(
            str(uid), {"total_usd": 0.0, "by_service": {}, "calls": 0}
        )

    def _add(uid, service: str, cost: float, *, calls: int = 0,
             seconds: float = 0.0, tokens: int = 0) -> None:
        s = _service_slot(service)
        s["cost_usd"] += cost
        s["calls"] += calls
        s["seconds"] += seconds
        s["tokens"] += tokens
        if uid is None:
            return
        slot = _user_slot(uid)
        slot["by_service"][service] = round(
            slot["by_service"].get(service, 0.0) + cost, 4
        )
        slot["total_usd"] += cost
        slot["calls"] += calls

    # ── 1. render_cost_logs: (instructor, service) ──
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
    for r in render_rows:
        _add(
            r.user_id,
            (r.service or "other").strip().lower(),
            float(r.cost or 0),
            calls=int(r.calls or 0),
            seconds=float(r.seconds or 0),
        )

    # ── 2. qa_logs: instructor 별 Claude Q&A ──
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
    for r in qa_rows:
        _add(
            r.user_id,
            "claude",
            float(r.cost or 0),
            calls=int(r.calls or 0),
            tokens=int(r.tokens or 0),
        )

    # ── 3. platform_cost_logs: (instructor, category, model) ──
    plat_rows = (
        await db.execute(
            select(
                Course.instructor_id.label("user_id"),
                CostLog.category.label("category"),
                CostLog.model.label("model"),
                func.sum(CostLog.cost_usd).label("cost"),
                func.sum(CostLog.input_tokens + CostLog.output_tokens).label("tokens"),
                func.count().label("calls"),
            )
            .join(Lecture, CostLog.lecture_id == Lecture.id)
            .join(Course, Lecture.course_id == Course.id)
            .where(CostLog.created_at >= start_date)
            .group_by(Course.instructor_id, CostLog.category, CostLog.model)
        )
    ).all()
    for r in plat_rows:
        _add(
            r.user_id,
            _platform_service(r.category, r.model),
            float(r.cost or 0),
            calls=int(r.calls or 0),
            tokens=int(r.tokens or 0),
        )

    # ── 종목별 집계 → 정렬 ──
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

    # ── 사용자 메타(email/name/role) 일괄 조회 ──
    user_meta: dict[str, User] = {}
    if user_agg:
        ids = [uuid.UUID(k) for k in user_agg]
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

    by_month = await _by_month(db, start_date)
    mtd = await _month_to_date(db, month_start)

    return {
        "generated_at": now.isoformat(),
        "window_days": COSTS_WINDOW_DAYS,
        "currency": "USD",
        "total_cost_usd": round(total_cost, 4),
        "month_to_date_usd": round(mtd, 4),
        "user_count": len(by_user),
        "services": services,
        "by_service": by_service,
        "by_month": by_month,
        "by_user": by_user,
    }


async def _by_month(db: AsyncSession, start_date: datetime) -> list[dict]:
    """월별(render + qa + platform) 비용 합계 — 최신순 최대 12개."""
    parts = []
    for model_col in (RenderCostLog, QALog, CostLog):
        rows = (
            await db.execute(
                select(
                    extract("year", model_col.created_at).label("year"),
                    extract("month", model_col.created_at).label("month"),
                    func.sum(model_col.cost_usd).label("total"),
                )
                .where(model_col.created_at >= start_date)
                .group_by("year", "month")
            )
        ).all()
        parts.extend(rows)

    merged: dict[tuple[int, int], float] = {}
    for r in parts:
        key = (int(r.year), int(r.month))
        merged[key] = merged.get(key, 0.0) + float(r.total or 0)

    out = [
        {"year": y, "month": m, "cost_usd": round(c, 4)}
        for (y, m), c in merged.items()
    ]
    out.sort(key=lambda x: (x["year"], x["month"]), reverse=True)
    return out[:12]


async def _month_to_date(db: AsyncSession, month_start: datetime) -> float:
    """render + qa + platform 의 당월 누적 비용 합."""
    total = 0.0
    for model_col in (RenderCostLog, QALog, CostLog):
        val = (
            await db.execute(
                select(func.sum(model_col.cost_usd)).where(
                    model_col.created_at >= month_start
                )
            )
        ).scalar()
        total += float(val or 0)
    return total
