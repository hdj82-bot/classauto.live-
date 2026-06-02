"""Stripe Checkout/Customer 멱등 키 + CORS preflight 캐시 + Stripe price 빈값 거부.

라운드3 Medium T1·T2·T3 회귀 테스트.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.config import Settings
from app.services.payment import (
    _build_client_reference_id,
    _idempotency_key,
    create_checkout_session,
)


# ── T1: idempotency key 형식 ──────────────────────────────────────────────────


def test_idempotency_key_includes_user_plan_date():
    user_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    today = datetime.now(timezone.utc).strftime("%Y%m%d")

    key = _idempotency_key("checkout", user_id, "BASIC")
    assert key == f"checkout:{user_id}:BASIC:{today}"


def test_idempotency_key_customer_no_plan():
    user_id = uuid.uuid4()
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = _idempotency_key("customer", user_id)
    assert key == f"customer:{user_id}:{today}"


def test_idempotency_key_stable_within_day():
    """같은 날 같은 (prefix, user, plan) 은 동일 키여야 한다."""
    user_id = uuid.uuid4()
    a = _idempotency_key("checkout", user_id, "PRO")
    b = _idempotency_key("checkout", user_id, "PRO")
    assert a == b


def test_client_reference_id_separate_from_idempotency():
    user_id = uuid.uuid4()
    client_ref = _build_client_reference_id(user_id, "BASIC")
    idem = _idempotency_key("checkout", user_id, "BASIC")
    assert client_ref != idem  # 둘은 서로 다른 식별자
    assert "checkout:" not in client_ref


# ── T1: stripe API 호출에 idempotency_key 가 전달되는지 ─────────────────────


@pytest.mark.asyncio
async def test_create_checkout_session_passes_idempotency_keys(db, professor):
    """stripe.Customer.create / stripe.checkout.Session.create 두 곳에 키 전달."""
    captured: dict[str, str] = {}

    class _FakeCustomer:
        def __init__(self, cid):
            self.id = cid

    def fake_customer_create(*, email, metadata, idempotency_key):  # noqa: ARG001
        captured["customer_idem"] = idempotency_key
        return _FakeCustomer("cus_test_123")

    class _FakeSession:
        def __init__(self):
            self.url = "https://checkout.stripe.com/pay/cs_test"

    def fake_session_create(**kwargs):
        captured["checkout_idem"] = kwargs["idempotency_key"]
        captured["client_reference_id"] = kwargs["client_reference_id"]
        return _FakeSession()

    # _PLAN_TO_PRICE 는 import 시점에 settings 를 한 번만 읽으므로
    # 후행 settings patch 로는 못 바꾼다. 모듈 dict 자체를 교체해 우회.
    fake_price_map = {"BASIC": "price_basic_test", "PRO": "price_pro_test"}

    with patch("app.services.payment.stripe.Customer.create", side_effect=fake_customer_create), \
         patch(
             "app.services.payment.stripe.checkout.Session.create",
             side_effect=fake_session_create,
         ), \
         patch("app.services.payment._PLAN_TO_PRICE", fake_price_map):
        url = await create_checkout_session(db, professor.id, professor.email, "BASIC")

    assert url == "https://checkout.stripe.com/pay/cs_test"
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    assert captured["customer_idem"] == f"customer:{professor.id}:{today}"
    assert captured["checkout_idem"] == f"checkout:{professor.id}:BASIC:{today}"
    assert captured["client_reference_id"].startswith(f"{professor.id}:BASIC:")


# ── T2: CORS preflight max_age=86400 ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_cors_preflight_max_age_is_86400(client):
    """OPTIONS 요청에 Access-Control-Max-Age=86400 헤더 응답."""
    resp = await client.options(
        "/api/v1/courses",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    # CORS 미들웨어가 preflight 처리 → 200 또는 204
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-max-age") == "86400"


# ── T3: 프로덕션에서 Stripe price 빈값 거부 ───────────────────────────────────


@pytest.mark.parametrize(
    "blank_value",
    ["", " ", "\t", "\n   "],
)
def test_production_blank_stripe_no_longer_raises(blank_value, monkeypatch):
    """1단계 베타 정책 회귀: STRIPE_* 빈값이어도 production 부팅이 통과해야 함.

    이전(0015 이전) 정책은 STRIPE_SECRET_KEY/WEBHOOK_SECRET/PRICE_BASIC/PRICE_PRO 를
    _REQUIRED_IN_PROD 에 포함시켜 빈값 시 RuntimeError 로 부팅을 차단했다. 베타
    무료 배포 단계에서는 결제 비활성이라 이 검증을 제거했다 — config.py 의
    `_REQUIRED_IN_PROD` 가 다시 STRIPE_* 를 포함하도록 회귀하지 않았는지 확인.
    실제 결제 차단은 app/api/v1/payment.py:_require_stripe() 가 503 으로 담당.
    """
    from app.core import config as cfg

    fresh = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="g_id",
        GOOGLE_OAUTH_CLIENT_SECRET="g_secret",
        HEYGEN_WEBHOOK_SECRET="h_sec",
        STRIPE_SECRET_KEY=blank_value,
        STRIPE_WEBHOOK_SECRET=blank_value,
        STRIPE_PRICE_BASIC=blank_value,
        STRIPE_PRICE_PRO=blank_value,
        ANTHROPIC_API_KEY="anth_x",
        OPENAI_API_KEY="oai_x",
        HEYGEN_API_KEY="hg_x",
        S3_BUCKET="ifl-bucket",
        AWS_ACCESS_KEY_ID="aws_id",
        AWS_SECRET_ACCESS_KEY="aws_secret",
    )
    monkeypatch.setattr(cfg, "settings", fresh)
    # raise 하지 않으면 통과 — 명시적으로 호출해서 회귀 시 즉시 실패하도록.
    cfg._validate_settings()


def test_production_all_present_passes(monkeypatch):
    from app.core import config as cfg

    fresh = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="g_id",
        GOOGLE_OAUTH_CLIENT_SECRET="g_secret",
        HEYGEN_WEBHOOK_SECRET="h_sec",
        STRIPE_SECRET_KEY="sk_live",
        STRIPE_WEBHOOK_SECRET="whsec_x",
        STRIPE_PRICE_BASIC="price_basic",
        STRIPE_PRICE_PRO="price_pro",
        ANTHROPIC_API_KEY="anth_x",
        OPENAI_API_KEY="oai_x",
        HEYGEN_API_KEY="hg_x",
        S3_BUCKET="ifl-bucket",
        AWS_ACCESS_KEY_ID="aws_id",
        AWS_SECRET_ACCESS_KEY="aws_secret",
    )
    monkeypatch.setattr(cfg, "settings", fresh)
    cfg._validate_settings()  # no raise


def test_invalid_environment_still_blocked():
    """round 1 에서 도입한 ENVIRONMENT 화이트리스트가 그대로 유효한지 회귀."""
    with pytest.raises(PydanticValidationError):
        Settings(ENVIRONMENT="prodution")
