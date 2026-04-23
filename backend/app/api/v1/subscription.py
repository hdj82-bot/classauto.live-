"""구독 플랜 API (app/api/subscription.py 흡수)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.subscription import PlanType
from app.models.user import User
from app.services.pipeline.subscription import (
    get_monthly_usage,
    get_or_create_subscription,
    update_plan,
)

router = APIRouter(prefix="/api/v1/subscription", tags=["subscription"])

_FREE_PLAN = PlanType.free.value


@router.get("", summary="내 구독 정보 조회")
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await get_or_create_subscription(db, user.id)
    await db.commit()
    return {
        "user_id": str(sub.user_id),
        "plan": sub.plan.value,
        "monthly_limit": sub.monthly_limit,
        "started_at": sub.started_at.isoformat() if sub.started_at else None,
        "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
    }


@router.post("", summary="FREE 플랜으로 다운그레이드")
async def change_plan(
    plan: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """FREE 다운그레이드만 허용합니다.
    유료 플랜(BASIC/PRO) 업그레이드는 POST /api/v1/payment/checkout를 사용하세요.
    """
    if plan != _FREE_PLAN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유료 플랜 변경은 POST /api/v1/payment/checkout를 통해 진행하세요.",
        )
    sub = await update_plan(db, user.id, plan)
    await db.commit()
    return {"user_id": str(sub.user_id), "plan": sub.plan.value, "monthly_limit": sub.monthly_limit}


@router.get("/usage", summary="이번 달 사용량")
async def get_usage(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await get_or_create_subscription(db, user.id)
    used = await get_monthly_usage(db, user.id)
    now = datetime.now(timezone.utc)
    await db.commit()
    return {
        "user_id": str(user.id),
        "plan": sub.plan.value,
        "monthly_limit": sub.monthly_limit,
        "used": used,
        "remaining": max(sub.monthly_limit - used, 0),
        "period": now.strftime("%Y-%m"),
    }
