"""헬스체크 엔드포인트 테스트.

`/health` 는 경량 liveness(외부 의존성 미접촉), `/health/deep` 는 의존성 포함
readiness. 종전엔 `/health` 하나가 둘을 겸해 5~10초가 걸렸다.
"""
from unittest.mock import MagicMock, patch

import pytest


# ── /health: 경량 liveness ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_is_lightweight(client):
    """liveness 는 항상 ok, 의존성 체크(checks) 를 포함하지 않는다."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "checks" not in data


@pytest.mark.asyncio
async def test_health_does_not_touch_dependencies(client):
    """liveness 는 DB·Redis·S3·Celery 를 건드리지 않아야 한다.

    celery inspect 가 예외를 던지도록 patch 해도 200 ok 여야 한다 — liveness 가
    의존성을 실제로 호출했다면 이 patch 가 관여했을 것이다.
    """
    fake_celery = MagicMock()
    fake_celery.control.inspect.side_effect = RuntimeError("dependency down")
    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── /health/deep: 의존성 readiness ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_deep_returns_checks(client):
    resp = await client.get("/health/deep")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "checks" in data


@pytest.mark.asyncio
async def test_health_deep_celery_ok_when_workers_respond(client):
    """ping() 이 worker dict 를 반환하면 celery: ok."""
    fake_inspect = MagicMock()
    fake_inspect.ping.return_value = {"celery@worker-1": {"ok": "pong"}}
    fake_celery = MagicMock()
    fake_celery.control.inspect.return_value = fake_inspect

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health/deep")

    assert resp.status_code == 200
    data = resp.json()
    assert data["checks"]["celery"] == "ok"


@pytest.mark.asyncio
async def test_health_deep_celery_no_workers_marks_degraded(client):
    """ping() 이 None 또는 빈 dict 면 celery: no_workers + status: degraded."""
    fake_inspect = MagicMock()
    fake_inspect.ping.return_value = None
    fake_celery = MagicMock()
    fake_celery.control.inspect.return_value = fake_inspect

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health/deep")

    data = resp.json()
    assert data["checks"]["celery"] == "no_workers"
    assert data["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_deep_celery_error_marks_degraded(client):
    """inspect 호출 자체가 실패 → celery: error."""
    fake_celery = MagicMock()
    fake_celery.control.inspect.side_effect = RuntimeError("broker down")

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health/deep")

    data = resp.json()
    assert data["checks"]["celery"] == "error"
    assert data["status"] == "degraded"
