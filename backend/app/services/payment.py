"""Stripe 결제 서비스."""
from __future__ import annotations

import logging
import uuid

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subscription import PlanType, Subscription
from app.services.pipeline.subscription import get_or_create_subscription

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

# Stripe Price ID ↔ PlanType 매핑
_PRICE_TO_PLAN: dict[str, PlanType] = {}
if settings.STRIPE_PRICE_BASIC:
    _PRICE_TO_PLAN[settings.STRIPE_PRICE_BASIC] = PlanType.basic
if settings.STRIPE_PRICE_PRO:
    _PRICE_TO_PLAN[settings.STRIPE_PRICE_PRO] = PlanType.pro

_PLAN_TO_PRICE: dict[str, str] = {
    "BASIC": settings.STRIPE_PRICE_BASIC,
    "PRO": settings.STRIPE_PRICE_PRO,
}


class PaymentError(Exception):
    """결제 관련 에러."""


async def create_checkout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_email: str,
    plan: str,
) -> str:
    """Stripe Checkout 세션 생성. checkout URL을 반환."""
    if plan not in _PLAN_TO_PRICE or not _PLAN_TO_PRICE[plan]:
        raise PaymentError(f"결제할 수 없는 플랜입니다: {plan}")

    sub = await get_or_create_subscription(db, user_id)

    # Stripe Customer 생성 또는 재사용
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user_email,
            metadata={"user_id": str(user_id)},
        )
        sub.stripe_customer_id = customer.id
        await db.flush()
    else:
        customer = stripe.Customer.retrieve(sub.stripe_customer_id)

    session = stripe.checkout.Session.create(
        customer=sub.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": _PLAN_TO_PRICE[plan], "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/subscription?status=success",
        cancel_url=f"{settings.FRONTEND_URL}/subscription?status=cancel",
        metadata={"user_id": str(user_id), "plan": plan},
    )

    logger.info("Stripe Checkout 세션 생성: user_id=%s, plan=%s", user_id, plan)
    return session.url


async def create_portal_session(db: AsyncSession, user_id: uuid.UUID) -> str:
    """Stripe Customer Portal 세션 생성. portal URL을 반환."""
    sub = await get_or_create_subscription(db, user_id)

    if not sub.stripe_customer_id:
        raise PaymentError("결제 이력이 없습니다. 먼저 구독을 시작하세요.")

    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/subscription",
    )

    return session.url


async def handle_webhook_event(db: AsyncSession, event: stripe.Event) -> str:
    """Stripe 웹훅 이벤트 처리."""
    event_type = event.type

    if event_type == "checkout.session.completed":
        return await _handle_checkout_completed(db, event.data.object)
    elif event_type == "customer.subscription.updated":
        return await _handle_subscription_updated(db, event.data.object)
    elif event_type == "customer.subscription.deleted":
        return await _handle_subscription_deleted(db, event.data.object)
    elif event_type == "invoice.payment_failed":
        return await _handle_payment_failed(db, event.data.object)
    else:
        logger.info("처리하지 않는 Stripe 이벤트: %s", event_type)
        return "ignored"


async def _handle_checkout_completed(db: AsyncSession, session) -> str:
    """Checkout 완료 → 구독 활성화."""
    customer_id = session.customer
    subscription_id = session.subscription
    metadata = session.metadata or {}
    plan = metadata.get("plan", "BASIC")

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        user_id = metadata.get("user_id")
        if user_id:
            sub = await get_or_create_subscription(db, uuid.UUID(user_id))
            sub.stripe_customer_id = customer_id

    if sub:
        sub.stripe_subscription_id = subscription_id
        sub.plan = PlanType(plan)
        await db.flush()
        logger.info("구독 활성화: customer=%s, plan=%s", customer_id, plan)
        return "activated"

    logger.warning("Checkout 완료했으나 사용자를 찾을 수 없음: customer=%s", customer_id)
    return "user_not_found"


async def _handle_subscription_updated(db: AsyncSession, subscription) -> str:
    """구독 변경 (업/다운그레이드)."""
    customer_id = subscription.customer
    price_id = subscription.items.data[0].price.id if subscription.items.data else None

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        return "user_not_found"

    new_plan = _PRICE_TO_PLAN.get(price_id)
    if new_plan:
        sub.plan = new_plan
        sub.stripe_subscription_id = subscription.id
        await db.flush()
        logger.info("구독 변경: customer=%s, plan=%s", customer_id, new_plan.value)
        return "updated"

    return "unknown_price"


async def _handle_subscription_deleted(db: AsyncSession, subscription) -> str:
    """구독 해지 → FREE 플랜으로 전환."""
    customer_id = subscription.customer

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        return "user_not_found"

    sub.plan = PlanType.free
    sub.stripe_subscription_id = None
    await db.flush()
    logger.info("구독 해지 → FREE: customer=%s", customer_id)
    return "cancelled"


async def _handle_payment_failed(db: AsyncSession, invoice) -> str:
    """결제 실패 알림 로깅."""
    customer_id = invoice.customer
    logger.warning("결제 실패: customer=%s, amount=%s", customer_id, invoice.amount_due)
    return "payment_failed_logged"


async def _get_sub_by_customer(db: AsyncSession, customer_id: str) -> Subscription | None:
    """Stripe customer ID로 구독 조회."""
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()
