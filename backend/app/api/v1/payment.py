"""Stripe 결제 API."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

import stripe

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.payment import (
    PaymentError,
    create_checkout_session,
    create_portal_session,
    handle_webhook_event,
)

router = APIRouter(prefix="/api/v1/payment", tags=["payment"])


@router.post("/checkout", summary="Stripe Checkout 세션 생성")
async def checkout(
    plan: Literal["BASIC", "PRO"],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        url = await create_checkout_session(db, user.id, user.email, plan)
        await db.commit()
        return {"checkout_url": url}
    except PaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal", summary="Stripe Customer Portal (구독 관리)")
async def portal(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        url = await create_portal_session(db, user.id)
        return {"portal_url": url}
    except PaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook", summary="Stripe 웹훅 수신")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook not configured")

    try:
        event = stripe.Webhook.construct_event(body, sig, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="유효하지 않은 서명입니다.")
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 페이로드입니다.")

    result = await handle_webhook_event(db, event)
    await db.commit()
    return {"status": "ok", "result": result}
