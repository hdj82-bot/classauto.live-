"""HeyGen 예산 서킷 브레이커.

create_video 직전에 누적 HeyGen 비용을 검사해 일/월 한도를 넘으면 차단한다.
HeyGen 비용은 render_cost_logs 에 ``service="heygen"`` 으로 기록되므로
(제출 시 operation="heygen_submit" cost 0, 완료 시 operation="video_render" 실비용),
해당 행들을 시간 윈도로 합산한다.

한계: 비용은 영상 완료 시점에 기록되므로, 아직 완료되지 않은 in-flight 렌더는
합계에 잡히지 않는다. 짧은 시간에 다수 제출이 몰리면 한도를 일시적으로 초과할 수
있으나, 실질 하드캡은 HeyGen 계정 잔액(auto-refill OFF)이며 이 브레이커는
재시도 루프·실수 대량 생성 같은 사고를 막는 2차 방어선이다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.qa_answer_cache import QAAnswerCache
from app.models.video_render import RenderCostLog

logger = logging.getLogger(__name__)

_HEYGEN_SERVICE = "heygen"


class BudgetExceededError(Exception):
    """HeyGen 일/월 예산 한도 초과 — create_video 차단."""


class QARenderQuotaError(BudgetExceededError):
    """교수자 월 Q&A 아바타 렌더 한도 초과 — 야간 배치 렌더 차단."""


def heygen_spend_usd(db: Session, since: datetime) -> float:
    """``since`` 이후 기록된 HeyGen 비용 합계(USD)."""
    total = db.execute(
        select(func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0)).where(
            RenderCostLog.service == _HEYGEN_SERVICE,
            RenderCostLog.created_at >= since,
        )
    ).scalar()
    return float(total or 0.0)


def assert_heygen_budget(db: Session, *, now: datetime | None = None) -> None:
    """일/월 한도 초과 시 ``BudgetExceededError`` 를 raise. 한도 0 이면 해당 검사 비활성.

    mock 모드는 실제 비용이 발생하지 않으므로 검사를 건너뛴다.
    """
    if settings.HEYGEN_MOCK:
        return

    now = now or datetime.now(timezone.utc)
    daily_limit = settings.HEYGEN_DAILY_BUDGET_USD
    monthly_limit = settings.HEYGEN_MONTHLY_BUDGET_USD

    if daily_limit and daily_limit > 0:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        spent = heygen_spend_usd(db, day_start)
        if spent >= daily_limit:
            logger.error(
                "[BUDGET] HeyGen 일 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, daily_limit,
            )
            raise BudgetExceededError(
                f"HeyGen 일 예산 초과: ${spent:.2f} / ${daily_limit:.2f}"
            )

    if monthly_limit and monthly_limit > 0:
        month_start = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        spent = heygen_spend_usd(db, month_start)
        if spent >= monthly_limit:
            logger.error(
                "[BUDGET] HeyGen 월 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, monthly_limit,
            )
            raise BudgetExceededError(
                f"HeyGen 월 예산 초과: ${spent:.2f} / ${monthly_limit:.2f}"
            )


# ── Q&A 아바타 렌더 한도 (docs/planning/09 §5: 교수자당 월 2영상 × 3렌더 = 6) ──


def _month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def qa_renders_used_this_month(
    db: Session, instructor_id, *, now: datetime | None = None
) -> int:
    """이번 달 해당 교수자의 Q&A 아바타 렌더 수.

    렌더 1건 = 대표 행(heygen_job_id 보유). 형제 행(heygen_job_id NULL)·실패 후
    재시도와 무관하게 "실제로 HeyGen 에 제출된 렌더"만 센다. failed 도 한도에
    포함해(이미 제출·과금됐을 수 있음) 재시도 폭주를 막는다.
    """
    month_start = _month_start(now)
    total = db.execute(
        select(func.count(QAAnswerCache.id)).where(
            QAAnswerCache.instructor_id == instructor_id,
            QAAnswerCache.heygen_job_id.isnot(None),
            QAAnswerCache.created_at >= month_start,
        )
    ).scalar()
    return int(total or 0)


def qa_render_quota_remaining(
    db: Session, instructor_id, *, now: datetime | None = None
) -> int:
    """이번 달 남은 Q&A 렌더 슬롯 수(0 이상). 한도 0/음수면 0(렌더 비활성)."""
    cap = settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
    if not cap or cap <= 0:
        return 0
    used = qa_renders_used_this_month(db, instructor_id, now=now)
    return max(0, cap - used)


def assert_qa_render_budget(
    db: Session, instructor_id, *, now: datetime | None = None
) -> None:
    """Q&A 아바타 렌더 직전 검사 — 교수자 월 한도 + 전역 HeyGen 예산($).

    - 교수자 월 렌더 한도(09 §5: 6) 소진 시 ``QARenderQuotaError``.
    - 전역 일/월 $ 서킷 브레이커(``assert_heygen_budget``) 재사용 — mock 은 통과.
    렌더 한도는 mock 에서도 적용(렌더 "수" 통제이므로). $ 브레이커만 mock 면제.
    """
    if qa_render_quota_remaining(db, instructor_id, now=now) <= 0:
        cap = settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
        used = qa_renders_used_this_month(db, instructor_id, now=now)
        logger.warning(
            "[BUDGET] Q&A 렌더 월 한도 초과로 차단: instructor=%s used=%d cap=%d",
            instructor_id, used, cap,
        )
        raise QARenderQuotaError(
            f"Q&A 아바타 렌더 월 한도 초과: {used}/{cap}"
        )
    assert_heygen_budget(db, now=now)
