"""Stripe 결제 서비스."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subscription import PlanType, Subscription
from app.services.pipeline.subscription import get_or_create_subscription

try:
    import sentry_sdk
except ImportError:  # pragma: no cover - sentry는 옵션 의존성
    sentry_sdk = None  # type: ignore[assignment]

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


def _build_client_reference_id(user_id: uuid.UUID, plan: str) -> str:
    """`{user_id}:{plan}:{YYYYMMDD}` 형식. 웹훅에서 사용자 식별 보조용.

    Stripe 측에 metadata 처럼 따라다니지만 멱등을 보장하지는 않는다.
    실제 API 멱등은 `_idempotency_key` 가 담당한다.
    """
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{user_id}:{plan}:{today}"


def _idempotency_key(prefix: str, user_id: uuid.UUID, *parts: str) -> str:
    """Stripe `Idempotency-Key` 헤더 값 생성.

    동일 키로 들어오는 두 번째 요청은 24시간 동안 첫 번째 응답을 그대로 반환하므로
    네트워크 재시도·중복 클릭으로 인한 다중 customer/checkout 생성을 차단한다.
    `prefix:{user_id}:{...parts}` 구조이며 날짜를 함께 묶어 일자별 분리.
    """
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = ":".join(parts) if parts else ""
    if suffix:
        return f"{prefix}:{user_id}:{suffix}:{today}"
    return f"{prefix}:{user_id}:{today}"


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

    # Stripe Customer 생성 또는 재사용 (Idempotency-Key 로 중복 생성 방지)
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user_email,
            metadata={"user_id": str(user_id)},
            idempotency_key=_idempotency_key("customer", user_id),
        )
        sub.stripe_customer_id = customer.id
        await db.flush()
    else:
        customer = stripe.Customer.retrieve(sub.stripe_customer_id)

    client_reference_id = _build_client_reference_id(user_id, plan)
    # 같은 user/plan/날짜 조합 재요청은 24h 동안 같은 Checkout 세션 재사용.
    # 네트워크 재시도·중복 클릭이 다중 세션을 만들지 않도록 차단.
    idem = _idempotency_key("checkout", user_id, plan)
    session = stripe.checkout.Session.create(
        customer=sub.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": _PLAN_TO_PRICE[plan], "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/subscription?status=success",
        cancel_url=f"{settings.FRONTEND_URL}/subscription?status=cancel",
        client_reference_id=client_reference_id,
        # metadata.plan은 더 이상 신뢰하지 않는다(웹훅에서 price_id로 결정).
        # user_id만 client_reference_id 보조용으로 남긴다.
        metadata={"user_id": str(user_id)},
        idempotency_key=idem,
    )

    logger.info(
        "Stripe Checkout 세션 생성: user_id=%s, plan=%s, ref=%s, idem=%s",
        user_id, plan, client_reference_id, idem,
    )
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


def _reject_unknown_price(price_id: str | None, *, customer_id: str, context: str) -> None:
    """알 수 없는 price_id를 받은 경우 4xx + Sentry 경고."""
    logger.error(
        "알 수 없는 Stripe price_id: context=%s, customer=%s, price_id=%s",
        context, customer_id, price_id,
    )
    if sentry_sdk is not None:
        sentry_sdk.capture_message(
            f"Unknown Stripe price_id in {context}: {price_id} (customer={customer_id})",
            level="warning",
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown Stripe price_id: {price_id}",
    )


def _extract_price_id(stripe_subscription) -> str | None:
    """Stripe Subscription 오브젝트에서 첫 line item의 price.id 추출."""
    items = getattr(stripe_subscription, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if not data:
        return None
    first = data[0]
    price = getattr(first, "price", None)
    return getattr(price, "id", None) if price is not None else None


async def _handle_checkout_completed(db: AsyncSession, session) -> str:
    """Checkout 완료 → 구독 활성화.

    metadata.plan은 신뢰하지 않는다. 실제 플랜은 Stripe Subscription의
    items.data[0].price.id 를 _PRICE_TO_PLAN 으로 매핑해 결정한다.
    """
    customer_id = session.customer
    subscription_id = session.subscription
    metadata = session.metadata or {}

    # 실제 가입 라인 아이템에서 price_id를 가져와 PlanType을 결정.
    stripe_sub = stripe.Subscription.retrieve(subscription_id)
    price_id = _extract_price_id(stripe_sub)
    new_plan = _PRICE_TO_PLAN.get(price_id) if price_id else None
    if not new_plan:
        _reject_unknown_price(price_id, customer_id=customer_id, context="checkout.completed")

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        user_id = metadata.get("user_id")
        if user_id:
            sub = await get_or_create_subscription(db, uuid.UUID(user_id))
            sub.stripe_customer_id = customer_id

    if sub:
        sub.stripe_subscription_id = subscription_id
        sub.plan = new_plan
        # 결제 성공 — past_due 그레이스 기한이 있었다면 해제(정상 복귀).
        sub.expires_at = None
        await db.flush()
        logger.info(
            "구독 활성화: customer=%s, plan=%s, price_id=%s",
            customer_id, new_plan.value, price_id,
        )
        return "activated"

    logger.warning("Checkout 완료했으나 사용자를 찾을 수 없음: customer=%s", customer_id)
    return "user_not_found"


async def _handle_subscription_updated(db: AsyncSession, subscription) -> str:
    """구독 변경 (업/다운그레이드)."""
    customer_id = subscription.customer
    price_id = _extract_price_id(subscription)

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        return "user_not_found"

    new_plan = _PRICE_TO_PLAN.get(price_id) if price_id else None
    if not new_plan:
        _reject_unknown_price(price_id, customer_id=customer_id, context="subscription.updated")

    sub.plan = new_plan
    sub.stripe_subscription_id = subscription.id
    # 구독이 유효 상태로 갱신됨 — past_due 그레이스 기한 해제(결제 복구 반영).
    sub.expires_at = None
    await db.flush()
    logger.info(
        "구독 변경: customer=%s, plan=%s, price_id=%s",
        customer_id, new_plan.value, price_id,
    )
    return "updated"


async def _handle_subscription_deleted(db: AsyncSession, subscription) -> str:
    """구독 해지 → FREE 플랜으로 전환."""
    customer_id = subscription.customer

    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        return "user_not_found"

    sub.plan = PlanType.free
    sub.stripe_subscription_id = None
    # 해지 확정 — past_due 그레이스 기한도 정리(상태 일관성).
    sub.expires_at = None
    await db.flush()
    logger.info("구독 해지 → FREE: customer=%s", customer_id)
    return "cancelled"


async def _handle_payment_failed(db: AsyncSession, invoice) -> str:
    """결제 실패 → past_due 추적 + 그레이스 기한 설정(M8).

    Stripe 는 결제 실패 시 smart retries 로 수 일에 걸쳐 재시도하므로 즉시
    다운그레이드하면 일시적 카드 오류만으로 플랜이 깎인다. 첫 실패에
    ``subscriptions.expires_at = now + PAYMENT_DUNNING_GRACE_DAYS`` 로 그레이스
    기한만 찍어 past_due 로 표시하고(연속 실패 시 기한을 앞당기지 않는다),
    기한이 지나도 복구되지 않은 구독은 ``downgrade_overdue_subscriptions``
    (beat 훅)가 FREE 로 내린다. 결제가 복구되면 성공 핸들러가 expires_at 을
    비워 정상 복귀시킨다.
    """
    customer_id = invoice.customer
    sub = await _get_sub_by_customer(db, customer_id)
    if not sub:
        logger.warning("결제 실패했으나 사용자를 찾을 수 없음: customer=%s", customer_id)
        return "user_not_found"

    # 첫 실패에만 그레이스 기한을 찍는다 — 연속 실패가 기한을 매번 미루지 못하게.
    if sub.expires_at is None:
        sub.expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.PAYMENT_DUNNING_GRACE_DAYS
        )
    await db.flush()

    grace_until = sub.expires_at.isoformat() if sub.expires_at else "?"
    logger.warning(
        "결제 실패 → past_due: customer=%s, amount=%s, grace_until=%s",
        customer_id, getattr(invoice, "amount_due", None), grace_until,
    )
    if sentry_sdk is not None:
        sentry_sdk.capture_message(
            f"Stripe payment_failed → past_due (customer={customer_id}, grace_until={grace_until})",
            level="warning",
        )
    return "past_due"


async def downgrade_overdue_subscriptions(
    db: AsyncSession, *, now: datetime | None = None
) -> int:
    """그레이스 기한(expires_at)이 지난 past_due 구독을 FREE 로 다운그레이드(M8).

    ``invoice.payment_failed`` 가 찍은 expires_at 이 경과했는데도 결제가 복구되지
    않은(=아직 유료 플랜인) 구독을 정리한다. Celery beat 가 하루 1회 호출하는 것을
    의도한 dunning 마무리 훅. 반환값은 다운그레이드한 건수.
    """
    cutoff = now or datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription).where(
            Subscription.expires_at.is_not(None),
            Subscription.expires_at < cutoff,
            Subscription.plan != PlanType.free,
        )
    )
    overdue = result.scalars().all()
    for sub in overdue:
        logger.info(
            "past_due 그레이스 만료 → FREE: customer=%s, plan=%s, expired_at=%s",
            sub.stripe_customer_id, sub.plan.value,
            sub.expires_at.isoformat() if sub.expires_at else "?",
        )
        sub.plan = PlanType.free
        sub.stripe_subscription_id = None
        sub.expires_at = None
    if overdue:
        await db.flush()
    return len(overdue)


async def _get_sub_by_customer(db: AsyncSession, customer_id: str) -> Subscription | None:
    """Stripe customer ID로 구독 조회."""
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()
