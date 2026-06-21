"""플랜 차등 게이트(deps.require_plan) — AVATAR_VOICE_FEATURE_ROADMAP.md.

정식 런칭용 인프라. 베타(PLAN_GATING_ENABLED=False)엔 전원 통과(게이팅 비활성),
플래그를 켜면 구독 플랜으로 게이팅한다. 운영자는 항상 통과.

게이트 의존성은 가벼운 검증만 하므로(외부 호출 없음) 체커를 직접 호출해 단위 검증한다
(아바타/음성 본문의 무거운 HeyGen/ElevenLabs 경로를 타지 않는다).
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.deps import require_plan
from app.core.config import settings
from app.models.subscription import PlanType, Subscription


async def _set_plan(db, user, plan: PlanType):
    db.add(Subscription(user_id=user.id, plan=plan))
    await db.flush()


@pytest.mark.asyncio
async def test_disabled_passes_everyone(db, professor, monkeypatch):
    """베타 기본값(OFF) — Free(구독 없음)도 통과(전원 무제한)."""
    monkeypatch.setattr(settings, "PLAN_GATING_ENABLED", False)
    checker = require_plan("basic", "pro")
    assert await checker(user=professor, db=db) is professor


@pytest.mark.asyncio
async def test_enabled_blocks_free(db, professor, monkeypatch):
    """ON — 구독 없으면 Free 로 생성되어 Basic/Pro 게이트에 막힌다(403)."""
    monkeypatch.setattr(settings, "PLAN_GATING_ENABLED", True)
    checker = require_plan("basic", "pro")
    with pytest.raises(HTTPException) as exc:
        await checker(user=professor, db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("plan", [PlanType.basic, PlanType.pro])
async def test_enabled_allows_basic_and_pro(db, professor, monkeypatch, plan):
    monkeypatch.setattr(settings, "PLAN_GATING_ENABLED", True)
    await _set_plan(db, professor, plan)
    checker = require_plan("basic", "pro")
    assert await checker(user=professor, db=db) is professor


@pytest.mark.asyncio
async def test_enabled_owner_bypasses_plan(db, professor, monkeypatch):
    """운영자(ADMIN_EMAILS)는 Free 여도 통과(QA·시연)."""
    monkeypatch.setattr(settings, "PLAN_GATING_ENABLED", True)
    professor.email = next(iter(settings.admin_email_set))
    await db.flush()
    checker = require_plan("basic", "pro")
    assert await checker(user=professor, db=db) is professor


@pytest.mark.asyncio
async def test_enabled_free_allowed_when_free_in_allowlist(db, professor, monkeypatch):
    """allowed 에 free 가 포함되면 Free 도 통과(범용성 — 게이트는 화이트리스트)."""
    monkeypatch.setattr(settings, "PLAN_GATING_ENABLED", True)
    checker = require_plan("free", "basic", "pro")
    assert await checker(user=professor, db=db) is professor
