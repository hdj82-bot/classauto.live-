"""IFL HeyGen — 구독 플랜 API 라우터.

GET    /api/subscription          — 구독 정보 조회
POST   /api/subscription          — 구독 생성/변경
GET    /api/subscription/usage    — 이번 달 사용량 조회
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import (
    SubscriptionCreateRequest,
    SubscriptionResponse,
    SubscriptionUpdateRequest,
    UsageResponse,
)
from app.services.subscription import (
    get_monthly_usage,
    get_or_create_subscription,
    update_plan,
)

subscription_router = APIRouter(prefix="/api/subscription", tags=["subscription"])


@subscription_router.get("", response_model=SubscriptionResponse)
async def get_subscription(
    user_id: uuid.UUID = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db),
):
    """사용자의 현재 구독 플랜을 조회한다. 없으면 FREE로 자동 생성."""
    sub = await get_or_create_subscription(db, user_id)
    await db.commit()
    return SubscriptionResponse(
        user_id=sub.user_id,
        plan=sub.plan,
        monthly_limit=sub.monthly_limit,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
    )


@subscription_router.post("", response_model=SubscriptionResponse)
async def create_or_update_subscription(
    body: SubscriptionCreateRequest | SubscriptionUpdateRequest,
    user_id: uuid.UUID = Query(None, description="사용자 ID (변경 시)"),
    db: AsyncSession = Depends(get_db),
):
    """구독을 생성하거나 플랜을 변경한다.

    - SubscriptionCreateRequest: 신규 생성 (user_id + plan)
    - SubscriptionUpdateRequest: 기존 변경 (query param user_id + plan)
    """
    if isinstance(body, SubscriptionCreateRequest):
        target_user_id = body.user_id
    else:
        if user_id is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="user_id 쿼리 파라미터가 필요합니다.")
        target_user_id = user_id

    sub = await update_plan(db, target_user_id, body.plan.value)
    await db.commit()

    return SubscriptionResponse(
        user_id=sub.user_id,
        plan=sub.plan,
        monthly_limit=sub.monthly_limit,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
    )


@subscription_router.get("/usage", response_model=UsageResponse)
async def get_usage(
    user_id: uuid.UUID = Query(..., description="사용자 ID"),
    db: AsyncSession = Depends(get_db),
):
    """이번 달 렌더링 사용량을 조회한다."""
    sub = await get_or_create_subscription(db, user_id)
    used = await get_monthly_usage(db, user_id)
    await db.commit()

    now = datetime.now(timezone.utc)
    return UsageResponse(
        user_id=sub.user_id,
        plan=sub.plan,
        monthly_limit=sub.monthly_limit,
        used=used,
        remaining=max(0, sub.monthly_limit - used),
        period=now.strftime("%Y-%m"),
    )
