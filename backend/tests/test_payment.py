"""Stripe 결제 서비스 및 API 테스트."""
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from fastapi import HTTPException

from app.models.subscription import PlanType
from app.services.payment import (
    PaymentError,
    _build_client_reference_id,
    create_checkout_session,
    create_portal_session,
    handle_webhook_event,
)
from tests.conftest import make_auth_header


def _stripe_subscription(price_id: str, sub_id: str = "sub_test_456"):
    """Stripe Subscription 응답을 모방하는 MagicMock 헬퍼."""
    item = MagicMock()
    item.price.id = price_id
    sub = MagicMock()
    sub.id = sub_id
    sub.items.data = [item]
    return sub


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
         patch("app.services.payment.stripe.checkout.Session.create", return_value=mock_session) as mock_create:
        mock_settings.STRIPE_PRICE_BASIC = "price_basic_test"
        mock_settings.STRIPE_PRICE_PRO = "price_pro_test"
        mock_settings.FRONTEND_URL = "http://localhost:3000"
        # Rebuild price mappings
        with patch.dict("app.services.payment._PLAN_TO_PRICE", {"BASIC": "price_basic_test", "PRO": "price_pro_test"}):
            url = await create_checkout_session(db, professor.id, professor.email, "BASIC")

    assert url == "https://checkout.stripe.com/session_123"

    # idempotency 보강: client_reference_id="{user_id}:{plan}:{YYYYMMDD}" 형식 확인
    kwargs = mock_create.call_args.kwargs
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    assert kwargs["client_reference_id"] == f"{professor.id}:BASIC:{today}"
    # metadata.plan 은 더 이상 보내지 않음(웹훅에서 신뢰하지 않음)
    assert "plan" not in kwargs["metadata"]
    assert kwargs["metadata"]["user_id"] == str(professor.id)


def test_build_client_reference_id_format(professor=None):
    """`{user_id}:{plan}:{YYYYMMDD}` 포맷이 유지되는지 회귀 테스트."""
    import uuid as _uuid
    uid = _uuid.uuid4()
    ref = _build_client_reference_id(uid, "BASIC")
    parts = ref.split(":")
    assert len(parts) == 3
    assert parts[0] == str(uid)
    assert parts[1] == "BASIC"
    assert len(parts[2]) == 8 and parts[2].isdigit()


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
    # metadata.plan 은 신뢰하지 않음 — price_id 기반 매핑이 권위.
    mock_event.data.object.metadata = {"user_id": str(professor.id)}

    fake_sub = _stripe_subscription(price_id="price_pro_test")
    with patch.dict(
        "app.services.payment._PRICE_TO_PLAN",
        {"price_pro_test": PlanType.pro},
        clear=True,
    ), patch(
        "app.services.payment.stripe.Subscription.retrieve",
        return_value=fake_sub,
    ):
        result = await handle_webhook_event(db, mock_event)

    assert result == "activated"
    assert sub.plan == PlanType.pro
    assert sub.stripe_subscription_id == "sub_test_456"


@pytest.mark.asyncio
async def test_webhook_checkout_ignores_metadata_plan(db, professor):
    """공격자가 metadata.plan='PRO'로 변조해도 price_id가 BASIC이면 BASIC으로 활성화."""
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_tamper_test"
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "checkout.session.completed"
    mock_event.data.object.customer = "cus_tamper_test"
    mock_event.data.object.subscription = "sub_test_basic"
    # 공격자가 임의로 PRO로 변조한 metadata
    mock_event.data.object.metadata = {"plan": "PRO", "user_id": str(professor.id)}

    fake_sub = _stripe_subscription(price_id="price_basic_test")
    with patch.dict(
        "app.services.payment._PRICE_TO_PLAN",
        {"price_basic_test": PlanType.basic, "price_pro_test": PlanType.pro},
        clear=True,
    ), patch(
        "app.services.payment.stripe.Subscription.retrieve",
        return_value=fake_sub,
    ):
        result = await handle_webhook_event(db, mock_event)

    assert result == "activated"
    # metadata.plan='PRO' 였지만 실제 price_id가 BASIC이므로 BASIC으로 결정.
    assert sub.plan == PlanType.basic


@pytest.mark.asyncio
async def test_webhook_checkout_unknown_price_rejected(db, professor):
    """알 수 없는 price_id면 4xx (HTTPException) 발생."""
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_unknown_price"
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "checkout.session.completed"
    mock_event.data.object.customer = "cus_unknown_price"
    mock_event.data.object.subscription = "sub_test_unk"
    mock_event.data.object.metadata = {"user_id": str(professor.id)}

    fake_sub = _stripe_subscription(price_id="price_does_not_exist")
    with patch.dict(
        "app.services.payment._PRICE_TO_PLAN",
        {"price_basic_test": PlanType.basic},
        clear=True,
    ), patch(
        "app.services.payment.stripe.Subscription.retrieve",
        return_value=fake_sub,
    ):
        with pytest.raises(HTTPException) as exc:
            await handle_webhook_event(db, mock_event)

    assert exc.value.status_code == 400
    assert "Unknown Stripe price_id" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_webhook_subscription_updated_unknown_price_rejected(db, professor):
    """customer.subscription.updated 에서도 알 수 없는 price_id는 4xx."""
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_upd_unknown"
    sub.plan = PlanType.basic
    await db.flush()

    item = MagicMock()
    item.price.id = "price_phantom"
    mock_event = MagicMock()
    mock_event.type = "customer.subscription.updated"
    mock_event.data.object.customer = "cus_upd_unknown"
    mock_event.data.object.id = "sub_phantom"
    mock_event.data.object.items.data = [item]

    with patch.dict(
        "app.services.payment._PRICE_TO_PLAN",
        {"price_basic_test": PlanType.basic, "price_pro_test": PlanType.pro},
        clear=True,
    ):
        with pytest.raises(HTTPException) as exc:
            await handle_webhook_event(db, mock_event)

    assert exc.value.status_code == 400
    # 거부됐으므로 plan 그대로.
    assert sub.plan == PlanType.basic


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
    """plan은 Literal["BASIC", "PRO"] 이므로 그 외 값은 Pydantic 검증 실패(422)."""
    resp = await client.post(
        "/api/v1/payment/checkout",
        params={"plan": "INVALID"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 422


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
    """secret 설정된 상태 + 잘못된 서명 -> 400."""
    from app.core.config import settings
    with patch.object(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test"):
        resp = await client.post(
            "/api/v1/payment/webhook",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "invalid"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_stripe_webhook_missing_secret(client):
    """STRIPE_WEBHOOK_SECRET 미설정(빈 문자열) 시 500 `Webhook not configured` 반환."""
    from app.core.config import settings
    with patch.object(settings, "STRIPE_WEBHOOK_SECRET", ""):
        resp = await client.post(
            "/api/v1/payment/webhook",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "t=1,v1=abc"},
        )
    assert resp.status_code in (400, 403, 500)
