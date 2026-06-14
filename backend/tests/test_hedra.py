"""Hedra(Character-3) 클라이언트 단위 테스트 — 본인 얼굴 Q&A 렌더 provider."""
from __future__ import annotations

import asyncio

import pytest

from app.core.config import settings
from app.services.pipeline import hedra


def test_estimate_cost_usd(monkeypatch):
    monkeypatch.setattr(settings, "HEDRA_COST_USD_PER_SECOND", 0.033)
    assert hedra.estimate_cost_usd(None) == 0.0
    assert hedra.estimate_cost_usd(0) == 0.0
    assert hedra.estimate_cost_usd(60) == pytest.approx(1.98, abs=1e-6)


def test_normalize_status():
    assert hedra._normalize_status("complete") == "completed"
    assert hedra._normalize_status("completed") == "completed"
    assert hedra._normalize_status("error") == "failed"
    assert hedra._normalize_status("failed") == "failed"
    assert hedra._normalize_status("queued") == "processing"
    assert hedra._normalize_status(None) == "processing"


def test_require_key_raises_when_missing(monkeypatch):
    monkeypatch.setattr(settings, "HEDRA_API_KEY", "")
    with pytest.raises(hedra.HedraError):
        hedra._require_key()


def test_mock_submit_and_status(monkeypatch):
    monkeypatch.setattr(settings, "HEDRA_MOCK", True)
    monkeypatch.setattr(settings, "HEDRA_MOCK_VIDEO_URL", "")

    loop = asyncio.new_event_loop()
    try:
        gen_id = loop.run_until_complete(
            hedra.submit_talking_video(
                image_bytes=b"img", image_ctype="image/png", audio_bytes=b"aud"
            )
        )
        assert gen_id == "mock-hedra-gen"
        st = loop.run_until_complete(hedra.get_generation_status(gen_id))
    finally:
        loop.close()
    assert st["status"] == "completed"
    assert st["video_url"] is None  # MOCK_VIDEO_URL 비어 있으면 None


def test_submit_builds_correct_payload(monkeypatch):
    """실 API(모킹) — 자산 생성·업로드·generation 페이로드를 정확히 구성하는지."""
    monkeypatch.setattr(settings, "HEDRA_MOCK", False)
    monkeypatch.setattr(settings, "HEDRA_API_KEY", "sk_h_test")
    monkeypatch.setattr(settings, "HEDRA_MODEL_ID", "char-3")
    monkeypatch.setattr(settings, "HEDRA_RESOLUTION", "720p")
    monkeypatch.setattr(settings, "HEDRA_ASPECT_RATIO", "16:9")

    calls: dict = {"assets": [], "uploads": [], "gen": None}

    class _Resp:
        def __init__(self, payload):
            self._p = payload
            self.status_code = 200

        def json(self):
            return self._p

    async def _fake_request_json(method, path, *, json=None, timeout=30.0):
        if path == "/assets":
            calls["assets"].append(json)
            # image 먼저, audio 다음 — 호출 순서로 id 부여.
            aid = f"{json['type']}-id"
            return _Resp({"id": aid})
        if path == "/generations":
            calls["gen"] = json
            return _Resp({"id": "gen-123"})
        raise AssertionError(f"예상치 못한 경로: {path}")

    async def _fake_upload(asset_id, filename, data, ctype):
        calls["uploads"].append((asset_id, filename, ctype))

    monkeypatch.setattr(hedra, "_request_json", _fake_request_json)
    monkeypatch.setattr(hedra, "_upload_asset", _fake_upload)

    loop = asyncio.new_event_loop()
    try:
        gen_id = loop.run_until_complete(
            hedra.submit_talking_video(
                image_bytes=b"IMG", image_ctype="image/png",
                audio_bytes=b"AUD", audio_ctype="audio/mpeg",
            )
        )
    finally:
        loop.close()

    assert gen_id == "gen-123"
    # image·audio 자산 둘 다 생성됐는지
    assert [a["type"] for a in calls["assets"]] == ["image", "audio"]
    assert len(calls["uploads"]) == 2
    # generation 페이로드가 자산 id·모델·해상도를 정확히 담았는지
    gen = calls["gen"]
    assert gen["ai_model_id"] == "char-3"
    assert gen["start_keyframe_id"] == "image-id"
    assert gen["audio_id"] == "audio-id"
    assert gen["resolution"] == "720p"
    assert gen["aspect_ratio"] == "16:9"
