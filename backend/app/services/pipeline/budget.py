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
from app.models.video_render import RenderCostLog

logger = logging.getLogger(__name__)

_HEYGEN_SERVICE = "heygen"


class BudgetExceededError(Exception):
    """HeyGen 일/월 예산 한도 초과 — create_video 차단."""


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
