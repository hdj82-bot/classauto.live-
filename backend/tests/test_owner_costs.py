"""계정주(운영자) 전용 비용 대시보드 API 통합 테스트.

커버리지: GET /api/owner/costs
  - 권한: admin(=owner) 200 / professor·student 403 / 미인증 401·403
  - 사용자(교수자)별 종목 집계: render_cost_logs → instructor 귀속
  - 최근 12개월 윈도우(13개월 전 비용 제외)
  - month_to_date 당월 누적
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import make_auth_header


# ── 권한 ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_costs_admin_ok_empty(client, admin):
    """admin(=owner)은 빈 DB 에서도 집계 골격을 200 으로 받는다."""
    resp = await client.get("/api/owner/costs", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    for key in (
        "total_cost_usd",
        "month_to_date_usd",
        "by_service",
        "by_user",
        "by_month",
        "services",
        "user_count",
    ):
        assert key in data
    assert data["window_days"] == 365
    assert data["total_cost_usd"] == 0.0
    assert data["by_user"] == []


@pytest.mark.asyncio
async def test_owner_costs_professor_forbidden(client, professor):
    resp = await client.get("/api/owner/costs", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_owner_costs_student_forbidden(client, student):
    resp = await client.get("/api/owner/costs", headers=make_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_owner_costs_unauthorized(client):
    resp = await client.get("/api/owner/costs")
    assert resp.status_code in (401, 403)


# ── 사용자(교수자)별 종목 집계 ────────────────────────────────────────────────


async def _seed_render_cost(db, lecture, instructor, service, cost, *, days_ago=10,
                            seconds=None):
    from app.models.video_render import RenderCostLog, RenderStatus, VideoRender

    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=instructor.id,
        avatar_id="av",
        status=RenderStatus.ready,
    )
    db.add(render)
    await db.flush()
    log = RenderCostLog(
        id=uuid.uuid4(),
        video_render_id=render.id,
        service=service,
        operation="op",
        cost_usd=cost,
        duration_seconds=seconds,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )
    db.add(log)
    await db.flush()
    return render


@pytest.mark.asyncio
async def test_owner_costs_per_user_breakdown(client, admin, db, professor, lecture):
    """render 비용이 교수자별·종목별로 집계되어 by_user/by_service 에 반영된다."""
    await _seed_render_cost(db, lecture, professor, "heygen", 2.5, seconds=150.0)
    await _seed_render_cost(db, lecture, professor, "elevenlabs", 0.5)

    resp = await client.get("/api/owner/costs", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_cost_usd"] == 3.0
    assert data["user_count"] == 1

    # 종목별 플랫폼 합계 — 비용 내림차순(heygen 먼저)
    by_service = {row["service"]: row for row in data["by_service"]}
    assert by_service["heygen"]["cost_usd"] == 2.5
    assert by_service["heygen"]["seconds"] == 150.0
    assert by_service["elevenlabs"]["cost_usd"] == 0.5
    assert data["services"][0] == "heygen"  # 정렬 확인

    # 사용자별 — 교수자 한 명, 종목별 비용 맵
    user = data["by_user"][0]
    assert user["user_id"] == str(professor.id)
    assert user["email"] == professor.email
    assert user["total_usd"] == 3.0
    assert user["by_service"]["heygen"] == 2.5
    assert user["by_service"]["elevenlabs"] == 0.5


@pytest.mark.asyncio
async def test_owner_costs_excludes_old_window(client, admin, db, professor, lecture):
    """13개월 전 비용은 윈도우 밖이라 합계에서 제외된다."""
    await _seed_render_cost(db, lecture, professor, "heygen", 1.0, days_ago=400)
    await _seed_render_cost(db, lecture, professor, "heygen", 2.5, days_ago=30)

    resp = await client.get("/api/owner/costs", headers=make_auth_header(admin))
    data = resp.json()
    assert data["total_cost_usd"] == 2.5
    assert {row["service"]: row["cost_usd"] for row in data["by_service"]} == {"heygen": 2.5}


@pytest.mark.asyncio
async def test_owner_costs_month_to_date(client, admin, db, professor, lecture):
    """당월 비용만 month_to_date_usd 에 잡힌다(45일 전은 제외)."""
    await _seed_render_cost(db, lecture, professor, "heygen", 4.0, days_ago=0)
    await _seed_render_cost(db, lecture, professor, "heygen", 9.0, days_ago=45)

    resp = await client.get("/api/owner/costs", headers=make_auth_header(admin))
    data = resp.json()
    # 윈도우(12개월) 총합엔 둘 다 잡히지만, 당월 누적엔 오늘 것(4.0)만.
    assert data["total_cost_usd"] == 13.0
    assert data["month_to_date_usd"] == 4.0
