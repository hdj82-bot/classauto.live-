"""구독 플랜 API 통합 테스트."""
import uuid

import pytest

from app.models.subscription import Subscription, PlanType
from tests.conftest import make_auth_header


# ── 구독 정보 조회 ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_subscription_creates_default(client, student):
    resp = await client.get(
        "/api/v1/subscription",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["plan"] == "FREE"
    assert data["monthly_limit"] == 2


@pytest.mark.asyncio
async def test_get_subscription_existing(client, professor, db):
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=professor.id,
        plan=PlanType.pro,
    )
    db.add(sub)
    await db.flush()

    resp = await client.get(
        "/api/v1/subscription",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json()["plan"] == "PRO"


@pytest.mark.asyncio
async def test_get_subscription_unauthorized(client):
    resp = await client.get("/api/v1/subscription")
    assert resp.status_code in (401, 403)


# ── 플랜 변경 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_change_plan_to_free_allowed(client, professor, db):
    """유료 플랜 → FREE 다운그레이드는 허용."""
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=professor.id,
        plan=PlanType.pro,
    )
    db.add(sub)
    await db.flush()

    resp = await client.post(
        "/api/v1/subscription",
        params={"plan": "FREE"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["plan"] == "FREE"
    assert data["monthly_limit"] == 2


@pytest.mark.asyncio
async def test_change_plan_to_basic_rejected(client, student, db):
    """BASIC 업그레이드 직접 시도 → 400 (결제 필요)."""
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=student.id,
        plan=PlanType.free,
    )
    db.add(sub)
    await db.flush()

    resp = await client.post(
        "/api/v1/subscription",
        params={"plan": "BASIC"},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 400
    assert "payment/checkout" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_change_plan_to_pro_rejected(client, professor, db):
    """PRO 업그레이드 직접 시도 → 400 (결제 필요)."""
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=professor.id,
        plan=PlanType.basic,
    )
    db.add(sub)
    await db.flush()

    resp = await client.post(
        "/api/v1/subscription",
        params={"plan": "PRO"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400
    assert "payment/checkout" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_change_plan_unauthorized(client):
    """미인증 플랜 변경 시도 → 401."""
    resp = await client.post("/api/v1/subscription", params={"plan": "FREE"})
    assert resp.status_code in (401, 403)


# ── 사용량 조회 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_usage(client, student, db):
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=student.id,
        plan=PlanType.free,
    )
    db.add(sub)
    await db.flush()

    resp = await client.get(
        "/api/v1/subscription/usage",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "used" in data
    assert "remaining" in data
    assert "period" in data
