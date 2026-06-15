"""VisionStory(V-Talk) 클라이언트 단위 테스트 — 본인 얼굴 Q&A 렌더 provider."""
from __future__ import annotations

import asyncio
import base64

import pytest

from app.core.config import settings
from app.services.pipeline import visionstory


def test_estimate_cost_usd(monkeypatch):
    monkeypatch.setattr(settings, "VISIONSTORY_COST_USD_PER_SECOND", 0.033)
    assert visionstory.estimate_cost_usd(None) == 0.0
    assert visionstory.estimate_cost_usd(0) == 0.0
    assert visionstory.estimate_cost_usd(60) == pytest.approx(1.98, abs=1e-6)


def test_normalize_status():
    assert visionstory._normalize_status("created") == "completed"
    assert visionstory._normalize_status("completed") == "completed"
    assert visionstory._normalize_status("failed") == "failed"
    assert visionstory._normalize_status("error") == "failed"
    assert visionstory._normalize_status("queued") == "processing"
    assert visionstory._normalize_status("creating") == "processing"
    assert visionstory._normalize_status(None) == "processing"


def test_require_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(settings, "VISIONSTORY_API_KEY", "")
    with pytest.raises(visionstory.VisionStoryError):
        visionstory._require_key()


def test_mock_create_submit_and_status(monkeypatch):
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", True)
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK_VIDEO_URL", "")

    loop = asyncio.new_event_loop()
    try:
        avatar_id = loop.run_until_complete(
            visionstory.create_avatar(b"img", "image/png")
        )
        assert avatar_id == "mock-vs-avatar"
        video_id = loop.run_until_complete(
            visionstory.submit_talking_video(avatar_id=avatar_id, audio_bytes=b"aud")
        )
        assert video_id == "mock-vs-video"
        st = loop.run_until_complete(visionstory.get_generation_status(video_id))
    finally:
        loop.close()
    assert st["status"] == "completed"
    assert st["video_url"] is None  # MOCK_VIDEO_URL 비어 있으면 None


def test_create_avatar_builds_inline_payload(monkeypatch):
    """POST /api/v1/avatar 페이로드에 base64 inline_data 를 정확히 담고 avatar_id 추출."""
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", False)
    monkeypatch.setattr(settings, "VISIONSTORY_API_KEY", "sk-vs-test")

    captured: dict = {}

    class _Resp:
        status_code = 200

        def __init__(self, payload):
            self._p = payload

        def json(self):
            return self._p

    async def _fake_request_json(method, path, *, json=None, params=None, timeout=30.0):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = json
        return _Resp({"data": {"avatar_id": "av-123", "thumbnail_url": "x"}})

    monkeypatch.setattr(visionstory, "_request_json", _fake_request_json)

    loop = asyncio.new_event_loop()
    try:
        avatar_id = loop.run_until_complete(
            visionstory.create_avatar(b"IMG", "image/png")
        )
    finally:
        loop.close()

    assert avatar_id == "av-123"
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/avatar"
    inline = captured["json"]["inline_data"]
    assert inline["mime_type"] == "image/png"
    assert base64.b64decode(inline["data"]) == b"IMG"


def test_submit_video_builds_audio_script(monkeypatch):
    """POST /api/v1/video 페이로드에 avatar_id·model·audio_script(base64)·해상도 구성."""
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", False)
    monkeypatch.setattr(settings, "VISIONSTORY_API_KEY", "sk-vs-test")
    monkeypatch.setattr(settings, "VISIONSTORY_MODEL_ID", "vs_talk_v1")
    monkeypatch.setattr(settings, "VISIONSTORY_RESOLUTION", "720p")
    monkeypatch.setattr(settings, "VISIONSTORY_ASPECT_RATIO", "16:9")

    captured: dict = {}

    class _Resp:
        status_code = 200

        def json(self):
            return {"data": {"video_id": "vid-456"}}

    async def _fake_request_json(method, path, *, json=None, params=None, timeout=30.0):
        captured["path"] = path
        captured["json"] = json
        return _Resp()

    monkeypatch.setattr(visionstory, "_request_json", _fake_request_json)

    loop = asyncio.new_event_loop()
    try:
        video_id = loop.run_until_complete(
            visionstory.submit_talking_video(
                avatar_id="av-123", audio_bytes=b"AUD", audio_ctype="audio/mpeg"
            )
        )
    finally:
        loop.close()

    assert video_id == "vid-456"
    assert captured["path"] == "/api/v1/video"
    body = captured["json"]
    assert body["avatar_id"] == "av-123"
    assert body["model_id"] == "vs_talk_v1"
    assert body["resolution"] == "720p"
    assert body["aspect_ratio"] == "16:9"
    # 합성한 음성을 그대로 쓰도록 voice_change=false, base64 inline_data 로 전달.
    audio = body["audio_script"]
    assert audio["voice_change"] is False
    assert base64.b64decode(audio["inline_data"]["data"]) == b"AUD"


def test_get_status_extracts_url(monkeypatch):
    """GET /api/v1/video 응답의 data.status/video_url 을 정규화해 돌려주는지."""
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", False)
    monkeypatch.setattr(settings, "VISIONSTORY_API_KEY", "sk-vs-test")

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "data": {
                    "video_id": "vid-456",
                    "status": "created",
                    "video_url": "https://cdn.visionstory.ai/vid-456.mp4",
                }
            }

    async def _fake_request_json(method, path, *, json=None, params=None, timeout=30.0):
        assert params == {"video_id": "vid-456"}
        return _Resp()

    monkeypatch.setattr(visionstory, "_request_json", _fake_request_json)

    loop = asyncio.new_event_loop()
    try:
        st = loop.run_until_complete(visionstory.get_generation_status("vid-456"))
    finally:
        loop.close()

    assert st["status"] == "completed"
    assert st["video_url"] == "https://cdn.visionstory.ai/vid-456.mp4"
