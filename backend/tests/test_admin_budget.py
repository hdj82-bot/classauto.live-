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
    # 인원 확대 판단의 근거가 되는 **유효** 단가도 함께 노출한다.
    assert (
        services["heygen"]["effective_unit_cost_usd_per_second"]
        == settings.HEYGEN_COST_USD_PER_SECOND
    )
    assert (
        services["visionstory"]["effective_unit_cost_usd_per_second"]
        == settings.VISIONSTORY_COST_USD_PER_SECOND
    )


# ── 단가 드리프트 감시 (스펙 13 §C-1a) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_budget_exposes_effective_unit_costs(client, db, owner_factory):
    """지금 어느 단가로 돌고 있는지가 응답에 드러나야 한다.

    코드 기본값과 Railway env 가 갈렸는데 아무도 몰랐던 게 이 기능의 존재 이유다.
    """
    owner = await owner_factory()
    data = (
        await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    ).json()

    costs = data["unit_costs"]
    assert costs["heygen_usd_per_second"] == settings.HEYGEN_COST_USD_PER_SECOND
    assert costs["visionstory_usd_per_second"] == settings.VISIONSTORY_COST_USD_PER_SECOND
    assert costs["expected_ratio"] == 2.0
    # 기본값은 0.0334 / 0.0167 = 정확히 2배.
    assert costs["ratio_consistent"] is True


@pytest.mark.asyncio
async def test_ratio_inconsistency_is_flagged(client, db, owner_factory, monkeypatch):
    """한쪽만 env override 되면(예: HeyGen 만 0.0083) 비율이 깨진 걸 알려야 한다.

    VisionStory 단가는 HeyGen 에서 유도된 값이라, HeyGen 만 절반으로 낮추면
    비율이 2 가 아니라 4 가 된다 — 조용히 넘어가면 안 되는 상태다.
    """
    monkeypatch.setattr(settings, "HEYGEN_COST_USD_PER_SECOND", 0.0083)
    owner = await owner_factory()
    data = (
        await client.get("/api/v1/admin/budget", headers=make_auth_header(owner))
    ).json()

    costs = data["unit_costs"]
    assert costs["ratio_consistent"] is False
    # 0.0334 / 0.0083 = 4.024… — 2배 전제에서 두 배 넘게 벌어진다.
    assert costs["visionstory_to_heygen_ratio"] == pytest.approx(
        settings.VISIONSTORY_COST_USD_PER_SECOND / 0.0083, abs=0.001
    )
    assert costs["visionstory_to_heygen_ratio"] > 4.0


def test_ratio_helpers_handle_disabled_accounting(monkeypatch):
    """단가 0 = 회계 비활성 — 0으로 나누지 말고 비율 판정도 하지 않는다."""
    from app.core import cost_rates

    monkeypatch.setattr(settings, "HEYGEN_COST_USD_PER_SECOND", 0.0)
    assert cost_rates.visionstory_to_heygen_ratio() is None
    # 비율을 따질 대상이 아니므로 '불일치'로 보고하지 않는다.
    assert cost_rates.ratio_is_consistent() is True


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


# ── 부팅 시 단가 로그 (스펙 13 §C-1a) ─────────────────────────────────────────


def test_celery_signals_log_unit_costs(caplog):
    """worker/beat 부팅에서도 유효 단가가 로그로 남아야 한다.

    비용을 실제로 계산하는 건 worker 다. 여기 로그가 없으면 어느 단가로 돌고 있는지
    보려고 Railway Variables 탭을 서비스마다 눌러야 한다.
    """
    import logging

    from app.celery_app import (
        _log_unit_costs_on_beat_init,
        _log_unit_costs_on_worker_ready,
    )

    with caplog.at_level(logging.INFO, logger="app.core.cost_rates"):
        _log_unit_costs_on_worker_ready()
        _log_unit_costs_on_beat_init()

    cost_lines = [r for r in caplog.records if "[COST]" in r.getMessage()]
    assert len(cost_lines) == 2  # worker 1 + beat 1
    # 메시지 본문에 값이 들어 있어야 Celery 기본 포맷에서도 읽을 수 있다.
    assert str(settings.HEYGEN_COST_USD_PER_SECOND) in cost_lines[0].getMessage()


def test_unit_cost_log_warns_on_ratio_drift(caplog, monkeypatch):
    """비율이 깨지면 WARNING 이 함께 나와야 한다 — 조용히 지나가면 안 된다."""
    import logging

    from app.core.cost_rates import log_effective_unit_costs

    monkeypatch.setattr(settings, "HEYGEN_COST_USD_PER_SECOND", 0.0083)
    with caplog.at_level(logging.INFO, logger="app.core.cost_rates"):
        log_effective_unit_costs()

    assert any(r.levelno == logging.WARNING for r in caplog.records)
