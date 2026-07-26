"""TTS 상한 — 교수자별 쿼터(1차) + 전역 $ 브레이커(2차). 스펙 13 §C-3.

핵심: **1차는 교수자별이다.** 전역 $ 를 1차로 쓰면 한 명이 한도를 태울 때 나머지 전원이
학기 중에 강의를 못 만든다 — 우리가 콘솔에 "한 명 때문에 전원이 멈춥니다"라고 써 놓고
같은 실수를 반복하는 셈이다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.user import User, UserRole
from app.models.video_render import RenderCostLog, RenderStatus, VideoRender
from app.services.cost_tracker import ELEVENLABS_USD_PER_1K_CHARS
from app.services.pipeline import budget
from tests.conftest import make_auth_header

OWNER_EMAIL = "classauto101@gmail.com"


@pytest.fixture
def db_sync():
    """budget 모듈은 Celery 워커에서 도는 sync 코드다."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.base import Base
    from tests.conftest import _patch_jsonb_columns

    _patch_jsonb_columns()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, VideoRender.__table__, RenderCostLog.__table__],
    )
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def instructor(db_sync):
    user = User(
        id=uuid.uuid4(),
        google_sub=f"g-{uuid.uuid4().hex[:8]}",
        email="prof@k.ac.kr",
        name="교수",
        role=UserRole.professor,
        is_active=True,
    )
    db_sync.add(user)
    db_sync.flush()
    return user


def _spend_chars(db, instructor_id, chars: int, *, when: datetime | None = None) -> None:
    """지정한 문자 수만큼 TTS 를 쓴 것으로 기록한다(cost 역산 기준)."""
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=uuid.uuid4(),
        instructor_id=instructor_id,
        avatar_id="a",
        slide_number=1,
        status=RenderStatus.ready,
    )
    db.add(render)
    db.flush()
    log = RenderCostLog(
        id=uuid.uuid4(),
        video_render_id=render.id,
        service="elevenlabs",
        operation="tts_synthesize",
        cost_usd=chars / 1000 * ELEVENLABS_USD_PER_1K_CHARS,
    )
    if when is not None:
        log.created_at = when
    db.add(log)
    db.flush()


# ── 사용량 집계 ───────────────────────────────────────────────────────────────


def test_chars_are_derived_from_cost(db_sync, instructor):
    """자수는 cost_usd 역산이다 — TTS 는 문자 수를 따로 저장하지 않는다."""
    _spend_chars(db_sync, instructor.id, 12_000)
    used = budget.tts_chars_used_this_month(db_sync, instructor.id)
    assert used == pytest.approx(12_000, rel=0.01)


def test_other_instructors_usage_is_not_counted(db_sync, instructor):
    """**쿼터는 교수자별이다.** 남의 사용량이 내 한도를 깎으면 안 된다."""
    other = User(
        id=uuid.uuid4(),
        google_sub=f"g-{uuid.uuid4().hex[:8]}",
        email="other@k.ac.kr",
        name="다른 교수",
        role=UserRole.professor,
        is_active=True,
    )
    db_sync.add(other)
    db_sync.flush()

    _spend_chars(db_sync, other.id, 999_999)
    assert budget.tts_chars_used_this_month(db_sync, instructor.id) == 0


def test_remaining_reflects_cap(db_sync, instructor):
    _spend_chars(db_sync, instructor.id, 10_000)
    remaining = budget.tts_quota_remaining(db_sync, instructor.id)
    assert remaining == pytest.approx(
        settings.TTS_MONTHLY_CHARS_PER_INSTRUCTOR - 10_000, rel=0.01
    )


# ── 1차: 교수자별 쿼터 ────────────────────────────────────────────────────────


def test_quota_allows_under_cap(db_sync, instructor):
    _spend_chars(db_sync, instructor.id, 1_000)
    budget.assert_tts_quota(db_sync, instructor.id, pending_chars=500)  # 예외 없음


def test_quota_blocks_over_cap(db_sync, instructor):
    _spend_chars(db_sync, instructor.id, settings.TTS_MONTHLY_CHARS_PER_INSTRUCTOR)
    with pytest.raises(budget.TTSQuotaError) as exc:
        budget.assert_tts_quota(db_sync, instructor.id, pending_chars=1)
    # 안내는 상황과 다음 행동을 담아야 한다.
    assert "운영자" in str(exc.value)


def test_pending_chars_counted_before_synthesis(db_sync, instructor):
    """지금 합성하려는 길이를 더해서 판정해야 한도를 넘겨 놓고 막는 일이 없다."""
    cap = settings.TTS_MONTHLY_CHARS_PER_INSTRUCTOR
    _spend_chars(db_sync, instructor.id, cap - 100)
    # 100자는 통과, 200자는 초과.
    budget.assert_tts_quota(db_sync, instructor.id, pending_chars=100)
    with pytest.raises(budget.TTSQuotaError):
        budget.assert_tts_quota(db_sync, instructor.id, pending_chars=200)


def test_quota_disabled_when_cap_zero(db_sync, instructor, monkeypatch):
    monkeypatch.setattr(settings, "TTS_MONTHLY_CHARS_PER_INSTRUCTOR", 0)
    _spend_chars(db_sync, instructor.id, 999_999)
    budget.assert_tts_quota(db_sync, instructor.id, pending_chars=999_999)


def test_previous_month_usage_does_not_count(db_sync, instructor):
    last_month = datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)
    _spend_chars(db_sync, instructor.id, 999_999, when=last_month)
    assert budget.tts_chars_used_this_month(db_sync, instructor.id) == 0


# ── 운영자 오버라이드 ─────────────────────────────────────────────────────────


def test_reset_moves_the_counting_start(db_sync, instructor):
    """리셋은 카운터를 0 으로 만드는 게 아니라 집계 시작점을 옮긴다."""
    _spend_chars(db_sync, instructor.id, settings.TTS_MONTHLY_CHARS_PER_INSTRUCTOR)
    with pytest.raises(budget.TTSQuotaError):
        budget.assert_tts_quota(db_sync, instructor.id, pending_chars=1)

    instructor.tts_quota_reset_at = datetime.now(timezone.utc)
    db_sync.flush()

    # 리셋 이후 사용분이 없으므로 다시 통과한다.
    assert budget.tts_chars_used_this_month(db_sync, instructor.id) == 0
    budget.assert_tts_quota(db_sync, instructor.id, pending_chars=1_000)


# ── 2차: 전역 $ 브레이커 ──────────────────────────────────────────────────────


def test_global_budget_blocks_only_at_accident_scale(db_sync, instructor, monkeypatch):
    """전역 한도는 사고 전용 — 정상 사용에선 쿼터가 먼저 걸린다."""
    monkeypatch.setattr(settings, "TTS_MONTHLY_BUDGET_USD", 10.0)
    monkeypatch.setattr(settings, "TTS_DAILY_BUDGET_USD", 0.0)

    _spend_chars(db_sync, instructor.id, 40_000)  # $12
    with pytest.raises(budget.BudgetExceededError):
        budget.assert_tts_budget(db_sync)


def test_global_budget_disabled_when_zero(db_sync, instructor, monkeypatch):
    monkeypatch.setattr(settings, "TTS_MONTHLY_BUDGET_USD", 0.0)
    monkeypatch.setattr(settings, "TTS_DAILY_BUDGET_USD", 0.0)
    _spend_chars(db_sync, instructor.id, 999_999)
    budget.assert_tts_budget(db_sync)


# ── 운영자 API ────────────────────────────────────────────────────────────────


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


@pytest.mark.asyncio
async def test_reset_endpoint_records_audit_log(client, db, owner_factory, professor):
    from sqlalchemy import select

    from app.models.admin_audit_log import AdminAuditLog

    owner = await owner_factory()
    resp = await client.post(
        f"/api/v1/admin/users/{professor.id}/reset-tts-quota",
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reset_at"] is not None

    logs = (
        await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "user.reset_tts_quota")
        )
    ).scalars().all()
    assert len(logs) == 1
    assert logs[0].detail["cap"] == settings.TTS_MONTHLY_CHARS_PER_INSTRUCTOR


@pytest.mark.asyncio
async def test_reset_endpoint_requires_admin(client, professor):
    resp = await client.post(
        f"/api/v1/admin/users/{professor.id}/reset-tts-quota",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_reset_endpoint_unknown_user_404(client, owner_factory):
    owner = await owner_factory()
    resp = await client.post(
        f"/api/v1/admin/users/{uuid.uuid4()}/reset-tts-quota",
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 404
