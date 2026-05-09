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


def _require_stripe() -> None:
    """1단계 베타는 결제 비활성. STRIPE_SECRET_KEY 미설정 시 503 으로 차단.

    config.py 의 _REQUIRED_IN_PROD 에서 STRIPE_* 를 제거했기 때문에
    production 부팅은 통과하지만, 결제 엔드포인트가 호출되면 여기서 막는다.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="결제 기능은 현재 비활성화되어 있습니다 (베타 무료 단계).",
        )


@router.post("/checkout", summary="Stripe Checkout 세션 생성")
async def checkout(
    plan: Literal["BASIC", "PRO"],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_stripe()
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
    _require_stripe()
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
        # 베타 단계: 웹훅 미구성. 외부에서 잘못 호출돼도 503으로 조용히 거부.
        raise HTTPException(status_code=503, detail="Webhook not configured")

    try:
        event = stripe.Webhook.construct_event(body, sig, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="유효하지 않은 서명입니다.")
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 페이로드입니다.")

    result = await handle_webhook_event(db, event)
    await db.commit()
    return {"status": "ok", "result": result}
