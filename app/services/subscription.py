"""IFL HeyGen — 구독 플랜 서비스 (한도 검사 + 사용량 계산)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import PLAN_LIMITS, Subscription
from app.models.video import VideoRender


class PlanLimitExceeded(Exception):
    """월간 렌더링 한도 초과."""

    def __init__(self, plan: str, monthly_limit: int, used: int):
        self.plan = plan
        self.monthly_limit = monthly_limit
        self.used = used
        super().__init__(
            f"{plan} 플랜 월간 한도 초과: {used}/{monthly_limit}편"
        )


async def get_or_create_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription:
    """사용자의 구독 정보를 조회하거나, 없으면 FREE 플랜으로 생성한다."""
    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()

    if sub is None:
        sub = Subscription(user_id=user_id, plan="FREE")
        db.add(sub)
        await db.flush()

    return sub


async def get_monthly_usage(db: AsyncSession, user_id: uuid.UUID) -> int:
    """이번 달 사용자의 렌더링 사용량 (FAILED 제외)을 계산한다."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(func.count())
        .select_from(VideoRender)
        .where(
            VideoRender.instructor_id == user_id,
            VideoRender.status != "FAILED",
            extract("year", VideoRender.created_at) == now.year,
            extract("month", VideoRender.created_at) == now.month,
        )
    )
    result = await db.execute(stmt)
    return result.scalar() or 0


async def check_limit(db: AsyncSession, user_id: uuid.UUID, requested: int = 1) -> tuple[Subscription, int]:
    """렌더링 요청 전 한도를 검사한다.

    Returns:
        (subscription, current_usage)

    Raises:
        PlanLimitExceeded: 한도 초과 시
    """
    sub = await get_or_create_subscription(db, user_id)
    used = await get_monthly_usage(db, user_id)
    limit = sub.monthly_limit

    if used + requested > limit:
        raise PlanLimitExceeded(plan=sub.plan, monthly_limit=limit, used=used)

    return sub, used


async def update_plan(db: AsyncSession, user_id: uuid.UUID, new_plan: str) -> Subscription:
    """사용자의 구독 플랜을 변경한다."""
    if new_plan not in PLAN_LIMITS:
        raise ValueError(f"유효하지 않은 플랜: {new_plan}")

    sub = await get_or_create_subscription(db, user_id)
    sub.plan = new_plan
    sub.started_at = datetime.now(timezone.utc)
    await db.flush()
    return sub
