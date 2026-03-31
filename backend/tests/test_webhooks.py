"""HeyGen 웹훅 API 통합 테스트."""
import hashlib
import hmac
import json
import uuid
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.core.config import settings
from app.models.video_render import VideoRender, RenderStatus


# ── HMAC 헬퍼 ────────────────────────────────────────────────────────────────

def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── 렌더링 성공 웹훅 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_success(client, professor, lecture, db):
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-test-job-123",
        avatar_id="test-avatar",
        tts_provider="elevenlabs",
        slide_number=1,
        status=RenderStatus.rendering,
    )
    db.add(render)
    await db.flush()
    await db.commit()

    payload = {
        "event_type": "avatar_video.success",
        "event_data": {
            "video_id": "heygen-test-job-123",
            "url": "https://heygen.com/video/test.mp4",
            "duration": 30,
        },
    }
    body = json.dumps(payload).encode()
    secret = settings.HEYGEN_WEBHOOK_SECRET or "test-secret"

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", secret), \
         patch("app.api.v1.webhooks.s3_svc.upload_from_url", new_callable=AsyncMock, return_value=("https://s3.amazonaws.com/video.mp4", 2.5)), \
         patch("app.api.v1.webhooks.notification.notify_instructor", new_callable=AsyncMock), \
         patch("app.api.v1.webhooks.cost_log.record"):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-HeyGen-Signature": _sign(body, secret),
            },
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processed"


# ── 렌더링 실패 웹훅 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_failure(client, professor, lecture, db):
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-fail-job-456",
        avatar_id="test-avatar",
        tts_provider="elevenlabs",
        slide_number=1,
        status=RenderStatus.rendering,
    )
    db.add(render)
    await db.flush()
    await db.commit()

    payload = {
        "event_type": "avatar_video.fail",
        "event_data": {
            "video_id": "heygen-fail-job-456",
            "error": "Rendering timeout",
        },
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.notification.notify_instructor", new_callable=AsyncMock):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processed"


# ── 알 수 없는 video_id ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_unknown_video(client):
    payload = {
        "event_type": "avatar_video.success",
        "event_data": {"video_id": "unknown-id"},
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"


# ── video_id 없는 페이로드 ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_no_video_id(client):
    payload = {"event_type": "test", "event_data": {}}
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    assert resp.json()["reason"] == "no video_id"


# ── 잘못된 HMAC 서명 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_invalid_signature(client):
    payload = {
        "event_type": "avatar_video.success",
        "event_data": {"video_id": "test"},
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", "real-secret"):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-HeyGen-Signature": "invalid-signature",
            },
        )
    assert resp.status_code == 401
