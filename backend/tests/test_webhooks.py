"""HeyGen 웹훅 API 통합 테스트.

주의: webhooks.py는 SyncSessionLocal을 직접 사용하므로
Docker 없이 로컬 SQLite 환경에서는 DB 연결 에러가 발생할 수 있습니다.
이 테스트는 HMAC 검증과 기본 라우팅 로직만 검증합니다.
"""
import hashlib
import hmac
import json
import uuid
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.video_render import VideoRender, RenderStatus


# ── HMAC 헬퍼 ────────────────────────────────────────────────────────────────

def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── 렌더링 성공 웹훅 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.xfail(reason="webhooks.py uses run_until_complete inside async context")
async def test_heygen_webhook_success(client, professor, lecture, db):
    render_id = uuid.uuid4()
    render = VideoRender(
        id=render_id,
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-test-job-123",
        avatar_id="test-avatar",
        tts_provider="elevenlabs",
        slide_number=1,
        status=RenderStatus.rendering,
    )

    # SyncSessionLocal을 mock하여 DB 연결 없이 테스트
    mock_db = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = render
    mock_db.execute.return_value = mock_result
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    payload = {
        "event_type": "avatar_video.success",
        "event_data": {
            "video_id": "heygen-test-job-123",
            "url": "https://heygen.com/video/test.mp4",
            "duration": 30,
        },
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.SyncSessionLocal", return_value=mock_db), \
         patch("app.api.v1.webhooks.s3_svc.upload_from_url", new_callable=AsyncMock, return_value=("https://s3.amazonaws.com/video.mp4", 2.5)), \
         patch("app.api.v1.webhooks.notification.notify_instructor", new_callable=AsyncMock), \
         patch("app.api.v1.webhooks.cost_log.record_once"):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processed"


# ── 렌더링 실패 웹훅 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.xfail(reason="webhooks.py uses run_until_complete inside async context")
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

    mock_db = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = render
    mock_db.execute.return_value = mock_result
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    payload = {
        "event_type": "avatar_video.fail",
        "event_data": {
            "video_id": "heygen-fail-job-456",
            "error": "Rendering timeout",
        },
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.SyncSessionLocal", return_value=mock_db), \
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
    mock_db = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    payload = {
        "event_type": "avatar_video.success",
        "event_data": {"video_id": "unknown-id"},
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.SyncSessionLocal", return_value=mock_db):
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


# ── 멱등성: 중복 웹훅 (동일 video_id+event_type 재수신) ─────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_duplicate_event_blocked(client):
    """동일 (video_id, event_type) 이벤트가 두 번째로 도착하면 200 + duplicate 반환.

    WebhookEventLog UNIQUE(provider, external_id, event_type) 제약이 두 번째
    flush 에서 IntegrityError 를 던지면 중복으로 처리된다.
    """
    mock_db = MagicMock()
    # WebhookEventLog flush 시 IntegrityError 발생 — 이미 동일 이벤트가 처리됨
    mock_db.flush.side_effect = IntegrityError("duplicate", {}, Exception("unique"))
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    payload = {
        "event_type": "avatar_video.success",
        "event_data": {"video_id": "heygen-dup-1", "url": "https://x"},
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.SyncSessionLocal", return_value=mock_db):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "duplicate"
    # render 조회까지 가지 않고 일찍 반환됐는지 — execute(select VideoRender) 호출 없음
    assert mock_db.execute.call_count == 0
    mock_db.rollback.assert_called_once()


# ── 멱등성: 이미 done 상태인 render에 success 재수신 ────────────────────────

@pytest.mark.asyncio
async def test_heygen_webhook_already_processed_render_ignored(client, professor, lecture):
    """이미 ready 상태인 render에 success 이벤트가 와도 200 + already_processed."""
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-already-done",
        avatar_id="test-avatar",
        tts_provider="elevenlabs",
        slide_number=1,
        status=RenderStatus.ready,  # 이미 처리 완료
    )

    mock_db = MagicMock()
    mock_db.flush.return_value = None  # 첫 수신이라 로그 INSERT 성공
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = render
    mock_db.execute.return_value = mock_result
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    payload = {
        "event_type": "avatar_video.success",
        "event_data": {"video_id": "heygen-already-done", "url": "https://x"},
    }
    body = json.dumps(payload).encode()

    with patch.object(settings, "HEYGEN_WEBHOOK_SECRET", ""), \
         patch("app.api.v1.webhooks.SyncSessionLocal", return_value=mock_db):
        resp = await client.post(
            "/api/v1/webhooks/heygen",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "already_processed"
    assert data["render_id"] == str(render.id)
    # 상태는 그대로
    assert render.status == RenderStatus.ready


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
