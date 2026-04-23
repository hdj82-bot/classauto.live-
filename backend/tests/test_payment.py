"""Stripe 결제 서비스 및 API 테스트."""
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.models.subscription import PlanType
from app.services.payment import (
    PaymentError,
    create_checkout_session,
    create_portal_session,
    handle_webhook_event,
)
from tests.conftest import make_auth_header


# ══════════════════════════════════════════════════════════════════════════════
# 서비스 단위 테스트
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_checkout_session_new_customer(db, professor):
    mock_customer = MagicMock()
    mock_customer.id = "cus_test_123"

    mock_session = MagicMock()
    mock_session.url = "https://checkout.stripe.com/session_123"

    with patch("app.services.payment.settings") as mock_settings, \
         patch("app.services.payment.stripe.Customer.create", return_value=mock_customer), \
         patch("app.services.payment.stripe.checkout.Session.create", return_value=mock_session):
        mock_settings.STRIPE_PRICE_BASIC = "price_basic_test"
        mock_settings.STRIPE_PRICE_PRO = "price_pro_test"
        mock_settings.FRONTEND_URL = "http://localhost:3000"
        # Rebuild price mappings
        with patch.dict("app.services.payment._PLAN_TO_PRICE", {"BASIC": "price_basic_test", "PRO": "price_pro_test"}):
            url = await create_checkout_session(db, professor.id, professor.email, "BASIC")

    assert url == "https://checkout.stripe.com/session_123"


@pytest.mark.asyncio
async def test_create_checkout_session_invalid_plan(db, professor):
    with pytest.raises(PaymentError, match="결제할 수 없는 플랜"):
        await create_checkout_session(db, professor.id, professor.email, "FREE")


@pytest.mark.asyncio
async def test_create_portal_session_no_customer(db, professor):
    with pytest.raises(PaymentError, match="결제 이력이 없습니다"):
        await create_portal_session(db, professor.id)


@pytest.mark.asyncio
async def test_create_portal_session_with_customer(db, professor):
    # 먼저 구독에 stripe_customer_id 설정
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_portal_test"
    await db.flush()

    mock_session = MagicMock()
    mock_session.url = "https://billing.stripe.com/portal_123"

    with patch("app.services.payment.stripe.billing_portal.Session.create", return_value=mock_session):
        url = await create_portal_session(db, professor.id)

    assert url == "https://billing.stripe.com/portal_123"


# ── 웹훅 핸들러 테스트 ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_checkout_completed(db, professor):
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_webhook_test"
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "checkout.session.completed"
    mock_event.data.object.customer = "cus_webhook_test"
    mock_event.data.object.subscription = "sub_test_456"
    mock_event.data.object.metadata = {"plan": "PRO", "user_id": str(professor.id)}

    result = await handle_webhook_event(db, mock_event)
    assert result == "activated"
    assert sub.plan == PlanType.pro
    assert sub.stripe_subscription_id == "sub_test_456"


@pytest.mark.asyncio
async def test_webhook_subscription_deleted(db, professor):
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_cancel_test"
    sub.plan = PlanType.pro
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "customer.subscription.deleted"
    mock_event.data.object.customer = "cus_cancel_test"

    result = await handle_webhook_event(db, mock_event)
    assert result == "cancelled"
    assert sub.plan == PlanType.free
    assert sub.stripe_subscription_id is None


@pytest.mark.asyncio
async def test_webhook_payment_failed(db):
    mock_event = MagicMock()
    mock_event.type = "invoice.payment_failed"
    mock_event.data.object.customer = "cus_fail_test"
    mock_event.data.object.amount_due = 9900

    result = await handle_webhook_event(db, mock_event)
    assert result == "payment_failed_logged"


@pytest.mark.asyncio
async def test_webhook_unknown_event(db):
    mock_event = MagicMock()
    mock_event.type = "some.unknown.event"

    result = await handle_webhook_event(db, mock_event)
    assert result == "ignored"


# ══════════════════════════════════════════════════════════════════════════════
# API 엔드포인트 테스트
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_checkout_endpoint(client, professor):
    with patch("app.api.v1.payment.create_checkout_session", new_callable=AsyncMock) as mock_checkout:
        mock_checkout.return_value = "https://checkout.stripe.com/test"
        resp = await client.post(
            "/api/v1/payment/checkout",
            params={"plan": "BASIC"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["checkout_url"] == "https://checkout.stripe.com/test"


@pytest.mark.asyncio
async def test_checkout_invalid_plan(client, professor):
    resp = await client.post(
        "/api/v1/payment/checkout",
        params={"plan": "INVALID"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_checkout_unauthorized(client):
    resp = await client.post(
        "/api/v1/payment/checkout",
        params={"plan": "BASIC"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_portal_endpoint(client, professor):
    with patch("app.api.v1.payment.create_portal_session", new_callable=AsyncMock) as mock_portal:
        mock_portal.return_value = "https://billing.stripe.com/test"
        resp = await client.post(
            "/api/v1/payment/portal",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["portal_url"] == "https://billing.stripe.com/test"


@pytest.mark.asyncio
async def test_webhook_invalid_signature(client):
    with patch("app.services.payment.settings") as mock_settings:
        mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
        resp = await client.post(
            "/api/v1/payment/webhook",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "invalid"},
        )
    assert resp.status_code == 400
