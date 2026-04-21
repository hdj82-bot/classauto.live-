"""구독 플랜 서비스."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import PLAN_LIMITS, PlanType, Subscription
from app.models.video_render import VideoRender

logger = logging.getLogger(__name__)


class PlanLimitExceeded(Exception):
    def __init__(self, plan: str, monthly_limit: int, used: int):
        self.plan = plan
        self.monthly_limit = monthly_limit
        self.used = used
        super().__init__(f"{plan} 플랜 월간 한도 초과: {used}/{monthly_limit}편")


async def get_or_create_subscription(db: AsyncSession, user_id: uuid.UUID) -> Subscription:
    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()
    if sub is None:
        sub = Subscription(user_id=user_id)
        db.add(sub)
        await db.flush()
    return sub


async def get_monthly_usage(db: AsyncSession, user_id: uuid.UUID) -> int:
    now = datetime.now(timezone.utc)
    stmt = (
        select(func.count()).select_from(VideoRender)
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
    sub = await get_or_create_subscription(db, user_id)
    used = await get_monthly_usage(db, user_id)
    if used + requested > sub.monthly_limit:
        logger.warning(
            "플랜 한도 초과: user_id=%s, plan=%s, used=%d/%d",
            user_id, sub.plan.value, used, sub.monthly_limit,
        )
        raise PlanLimitExceeded(plan=sub.plan.value, monthly_limit=sub.monthly_limit, used=used)
    return sub, used


async def update_plan(db: AsyncSession, user_id: uuid.UUID, new_plan: str) -> Subscription:
    if new_plan not in PLAN_LIMITS:
        logger.error("유효하지 않은 플랜 변경 시도: user_id=%s, plan=%s", user_id, new_plan)
        raise ValueError(f"유효하지 않은 플랜: {new_plan}")
    sub = await get_or_create_subscription(db, user_id)
    old_plan = sub.plan.value
    sub.plan = PlanType(new_plan)
    sub.started_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("플랜 변경: user_id=%s, %s → %s", user_id, old_plan, new_plan)
    return sub
