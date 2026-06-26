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
async def test_webhook_payment_failed_sets_past_due_grace(db, professor):
    """invoice.payment_failed → 즉시 다운그레이드하지 않고 그레이스 기한(past_due)만 설정(M8)."""
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_fail_test"
    sub.plan = PlanType.pro
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "invoice.payment_failed"
    mock_event.data.object.customer = "cus_fail_test"
    mock_event.data.object.amount_due = 9900

    result = await handle_webhook_event(db, mock_event)
    assert result == "past_due"
    # 그레이스 기한이 미래로 찍히고, 플랜은 즉시 깎이지 않는다.
    assert sub.expires_at is not None
    assert sub.expires_at > datetime.now(timezone.utc)
    assert sub.plan == PlanType.pro


@pytest.mark.asyncio
async def test_webhook_payment_failed_does_not_advance_grace(db, professor):
    """연속 결제 실패가 그레이스 기한을 매번 뒤로 미루지 못한다(첫 실패 기준 유지)."""
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_fail_twice"
    sub.plan = PlanType.basic
    await db.flush()

    def _evt():
        e = MagicMock()
        e.type = "invoice.payment_failed"
        e.data.object.customer = "cus_fail_twice"
        e.data.object.amount_due = 9900
        return e

    await handle_webhook_event(db, _evt())
    first_deadline = sub.expires_at
    assert first_deadline is not None

    await handle_webhook_event(db, _evt())
    assert sub.expires_at == first_deadline  # 두 번째 실패가 기한을 미루지 않음


@pytest.mark.asyncio
async def test_webhook_payment_failed_unknown_customer(db):
    """매칭되는 구독이 없으면 user_not_found 로 끝난다(부수효과 없음)."""
    mock_event = MagicMock()
    mock_event.type = "invoice.payment_failed"
    mock_event.data.object.customer = "cus_nonexistent"
    mock_event.data.object.amount_due = 100

    result = await handle_webhook_event(db, mock_event)
    assert result == "user_not_found"


@pytest.mark.asyncio
async def test_downgrade_overdue_subscriptions_downgrades_expired(db, professor):
    """그레이스 기한이 지난 past_due 유료 구독은 FREE 로 다운그레이드(M8 훅)."""
    from datetime import timedelta
    from app.services.pipeline.subscription import get_or_create_subscription
    from app.services.payment import downgrade_overdue_subscriptions

    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_overdue"
    sub.stripe_subscription_id = "sub_overdue"
    sub.plan = PlanType.pro
    sub.expires_at = datetime.now(timezone.utc) - timedelta(days=1)  # 그레이스 만료
    await db.flush()

    n = await downgrade_overdue_subscriptions(db)
    assert n == 1
    assert sub.plan == PlanType.free
    assert sub.stripe_subscription_id is None
    assert sub.expires_at is None


@pytest.mark.asyncio
async def test_downgrade_overdue_subscriptions_skips_within_grace(db, professor):
    """그레이스 기간 내(미래 expires_at)면 다운그레이드하지 않는다."""
    from datetime import timedelta
    from app.services.pipeline.subscription import get_or_create_subscription
    from app.services.payment import downgrade_overdue_subscriptions

    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_in_grace"
    sub.plan = PlanType.pro
    sub.expires_at = datetime.now(timezone.utc) + timedelta(days=3)
    await db.flush()

    n = await downgrade_overdue_subscriptions(db)
    assert n == 0
    assert sub.plan == PlanType.pro
    assert sub.expires_at is not None


@pytest.mark.asyncio
async def test_webhook_checkout_clears_past_due_grace(db, professor):
    """결제 복구(checkout.completed) 시 past_due 그레이스 기한이 해제된다."""
    from datetime import timedelta
    from app.services.pipeline.subscription import get_or_create_subscription
    sub = await get_or_create_subscription(db, professor.id)
    sub.stripe_customer_id = "cus_recover"
    sub.plan = PlanType.basic
    sub.expires_at = datetime.now(timezone.utc) - timedelta(days=1)  # past_due 상태
    await db.flush()

    mock_event = MagicMock()
    mock_event.type = "checkout.session.completed"
    mock_event.data.object.customer = "cus_recover"
    mock_event.data.object.subscription = "sub_recover"
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
    assert sub.expires_at is None  # 그레이스 해제


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
    # 1단계 베타 정책: STRIPE_SECRET_KEY 미설정이면 _require_stripe() 가 503 차단.
    # 결제 정상 흐름을 검증하려면 키가 설정된 상태로 우회.
    from app.core.config import settings
    with patch.object(settings, "STRIPE_SECRET_KEY", "sk_test_dummy"), \
         patch("app.api.v1.payment.create_checkout_session", new_callable=AsyncMock) as mock_checkout:
        mock_checkout.return_value = "https://checkout.stripe.com/test"
        resp = await client.post(
            "/api/v1/payment/checkout",
            params={"plan": "BASIC"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["checkout_url"] == "https://checkout.stripe.com/test"


@pytest.mark.asyncio
async def test_checkout_blocked_when_stripe_disabled(client, professor):
    """1단계 베타: STRIPE_SECRET_KEY 빈값이면 결제 엔드포인트는 503 으로 차단."""
    from app.core.config import settings
    with patch.object(settings, "STRIPE_SECRET_KEY", ""):
        resp = await client.post(
            "/api/v1/payment/checkout",
            params={"plan": "BASIC"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 503


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
    # checkout 과 동일 — 503 가드 우회를 위해 STRIPE_SECRET_KEY 임시 설정.
    from app.core.config import settings
    with patch.object(settings, "STRIPE_SECRET_KEY", "sk_test_dummy"), \
         patch("app.api.v1.payment.create_portal_session", new_callable=AsyncMock) as mock_portal:
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
    """STRIPE_WEBHOOK_SECRET 미설정(빈 문자열) 시 503 `Webhook not configured` 반환.

    1단계 베타에서 webhook secret 미구성을 외부 호출 차단 신호로 명시 — 500(서버 오류)
    대신 503(서비스 미가용) 으로 반환해 Sentry 노이즈를 줄였다.
    """
    from app.core.config import settings
    with patch.object(settings, "STRIPE_WEBHOOK_SECRET", ""):
        resp = await client.post(
            "/api/v1/payment/webhook",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "t=1,v1=abc"},
        )
    assert resp.status_code in (400, 403, 500, 503)
