"""운영자 콘솔 예산 미터 테스트 — 스펙 13 §C-1 / 스펙 14 §E.

핵심 요건: **미터의 집계 정의가 브레이커와 같아야 한다.** 미터가 60% 라는데
브레이커가 터지면 운영자는 원인을 못 찾는다. HeyGen 은 본문 렌더(render_cost_logs)와
Q&A 아바타 렌더(platform_cost_logs) 두 곳에 비용이 나뉘어 적재되므로, 둘 중 하나만
세면 어긋난다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.core.config import settings
from app.models.cost_log import CostCategory, CostLog
from app.models.user import User, UserRole
from app.services import admin_budget
from tests.conftest import make_auth_header

OWNER_EMAIL = "classauto101@gmail.com"


@pytest.fixture
def owner_factory(db):
    async def _make() -> User:
        user = User(
            id=uuid.uuid4(),
            google_sub=f"google-owner-{uuid.uuid4().hex[:8]}",
            email=OWNER_EMAIL,
            name="계정주",
            role=UserRole.professor,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user

    return _make


async def _add_qa_cost(db, lecture, model: str, cost: float) -> None:
    """platform_cost_logs.lecture_id 는 NOT NULL — 실제 강의에 귀속시킨다."""
    db.add(
        CostLog(
            id=uuid.uuid4(),
            lecture_id=lecture.id,
            category=CostCategory.avatar_qa,
            model=model,
            cost_usd=cost,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_budget_endpoint_requires_admin(client, professor):
    resp = await client.get("/api/v1/admin/budget", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_budget_reports_limits_and_active_professors(client, db, owner_factory):
    owner = await owner_factory()
    resp = await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["warn_threshold_pct"] == 80
    # owner 픽스처가 role=professor 라 활성 교수자에 포함된다.
    assert data["active_professor_count"] >= 1

    services = {s["service"]: s for s in data["services"]}
    assert set(services) == {"heygen", "visionstory"}
    assert services["heygen"]["monthly_budget_usd"] == settings.HEYGEN_MONTHLY_BUDGET_USD
    assert services["heygen"]["daily_budget_usd"] == settings.HEYGEN_DAILY_BUDGET_USD
    # 인원 확대 판단의 근거가 되는 단가도 함께 노출한다.
    assert services["heygen"]["unit_cost_usd_per_second"] == settings.HEYGEN_COST_USD_PER_SECOND


@pytest.mark.asyncio
async def test_heygen_meter_includes_qa_renders(client, db, owner_factory, lecture):
    """HeyGen Q&A 렌더(platform_cost_logs)도 합산해야 브레이커와 일치한다.

    이걸 빠뜨리면 미터는 0% 인데 브레이커는 한도에 걸리는 상태가 된다.
    """
    owner = await owner_factory()
    await _add_qa_cost(db, lecture, "heygen", 12.5)

    resp = await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    heygen = next(s for s in resp.json()["services"] if s["service"] == "heygen")
    assert heygen["spent_month_usd"] == pytest.approx(12.5)
    assert heygen["spent_today_usd"] == pytest.approx(12.5)


@pytest.mark.asyncio
async def test_visionstory_meter_counts_its_own_spend_only(client, db, owner_factory, lecture):
    """서비스별로 분리돼야 한다 — 둘은 별개 브레이커다."""
    owner = await owner_factory()
    await _add_qa_cost(db, lecture, "visionstory", 7.0)
    await _add_qa_cost(db, lecture, "heygen", 3.0)

    services = {
        s["service"]: s
        for s in (
            await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
        ).json()["services"]
    }
    assert services["visionstory"]["spent_month_usd"] == pytest.approx(7.0)
    assert services["heygen"]["spent_month_usd"] == pytest.approx(3.0)


@pytest.mark.asyncio
async def test_per_professor_and_headroom(client, db, owner_factory, lecture):
    """'몇 명까지 더 초대해도 되나' — 1인당 소진과 여유 인원."""
    owner = await owner_factory()
    await _add_qa_cost(db, lecture, "heygen", 60.0)

    data = (
        await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    ).json()
    heygen = next(s for s in data["services"] if s["service"] == "heygen")
    professors = data["active_professor_count"]

    assert heygen["per_professor_month_usd"] == pytest.approx(60.0 / professors)
    # 남은 예산 / 1인당 소진 = 추가 감당 가능 인원.
    expected = int((settings.HEYGEN_MONTHLY_BUDGET_USD - 60.0) // (60.0 / professors))
    assert heygen["headroom_professors"] == expected


@pytest.mark.asyncio
async def test_headroom_is_none_without_usage(client, db, owner_factory):
    """아직 아무도 렌더를 안 돌렸으면 추정 근거가 없다 — 숫자를 지어내지 않는다."""
    owner = await owner_factory()
    data = (
        await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    ).json()
    heygen = next(s for s in data["services"] if s["service"] == "heygen")
    assert heygen["spent_month_usd"] == 0
    assert heygen["headroom_professors"] is None


@pytest.mark.asyncio
async def test_pct_is_none_when_limit_disabled(db, monkeypatch):
    """한도 0 = 브레이커 비활성 — 0으로 나눠 100% 로 보이면 안 된다."""
    monkeypatch.setattr(settings, "HEYGEN_MONTHLY_BUDGET_USD", 0.0)
    monkeypatch.setattr(settings, "HEYGEN_DAILY_BUDGET_USD", 0.0)

    data = await admin_budget.budget_overview(db)
    heygen = next(s for s in data["services"] if s["service"] == "heygen")
    assert heygen["month_pct"] is None
    assert heygen["day_pct"] is None
