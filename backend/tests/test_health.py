"""헬스체크 엔드포인트 테스트."""
from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "checks" in data


# ── G: Celery worker reachability ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_celery_ok_when_workers_respond(client):
    """ping() 이 worker dict 를 반환하면 celery: ok."""
    fake_inspect = MagicMock()
    fake_inspect.ping.return_value = {"celery@worker-1": {"ok": "pong"}}
    fake_celery = MagicMock()
    fake_celery.control.inspect.return_value = fake_inspect

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["checks"]["celery"] == "ok"


@pytest.mark.asyncio
async def test_health_celery_no_workers_marks_degraded(client):
    """ping() 이 None 또는 빈 dict 면 celery: no_workers + status: degraded."""
    fake_inspect = MagicMock()
    fake_inspect.ping.return_value = None
    fake_celery = MagicMock()
    fake_celery.control.inspect.return_value = fake_inspect

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health")

    data = resp.json()
    assert data["checks"]["celery"] == "no_workers"
    assert data["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_celery_error_marks_degraded(client):
    """inspect 호출 자체가 실패 → celery: error."""
    fake_celery = MagicMock()
    fake_celery.control.inspect.side_effect = RuntimeError("broker down")

    with patch("app.celery_app.celery", fake_celery):
        resp = await client.get("/health")

    data = resp.json()
    assert data["checks"]["celery"] == "error"
    assert data["status"] == "degraded"
