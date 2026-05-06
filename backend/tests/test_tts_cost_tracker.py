"""TTS 단가 산정 + cost_logs 기록 헬퍼 단위 테스트."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services import cost_tracker


# ── 단가 추정 ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "provider,chars,expected_min",
    [
        ("elevenlabs", 1000, 0.299),   # ~$0.30/1K
        ("google_tts", 1000, 0.015),   # ~$0.016/1K
        ("elevenlabs", 500, 0.149),
        ("google_tts", 5000, 0.079),
    ],
)
def test_estimate_tts_cost_usd_positive(provider, chars, expected_min):
    cost = cost_tracker.estimate_tts_cost_usd(provider, chars)
    assert cost > 0
    # 부동소수 직접 비교 대신 하한만 확인 — 단가는 시간이 지나며 미세 조정될 수 있음.
    assert cost >= expected_min


def test_estimate_tts_cost_usd_zero_chars():
    assert cost_tracker.estimate_tts_cost_usd("elevenlabs", 0) == 0.0


def test_estimate_tts_cost_usd_negative_chars():
    assert cost_tracker.estimate_tts_cost_usd("google_tts", -1) == 0.0


def test_estimate_tts_cost_usd_unknown_provider():
    """알 수 없는 provider 는 0 — 비용 회계 안전."""
    assert cost_tracker.estimate_tts_cost_usd("unknown", 10000) == 0.0


# ── record_tts_cost: cost_log.record_once_committed 위임 ─────────────────────


def test_record_tts_cost_calls_record_once_committed_with_metadata():
    fake_sm = MagicMock(name="SessionLocal")
    render_id = uuid.uuid4()

    with patch(
        "app.services.cost_tracker.cost_log.record_once_committed",
        return_value=True,
    ) as inner:
        ok = cost_tracker.record_tts_cost(
            sessionmaker=fake_sm,
            video_render_id=render_id,
            provider="elevenlabs",
            text_chars=1234,
            duration_seconds=2.5,
        )

    assert ok is True
    inner.assert_called_once()
    _, kwargs = inner.call_args
    assert kwargs["sessionmaker"] is fake_sm
    assert kwargs["video_render_id"] == render_id
    assert kwargs["service"] == "elevenlabs"
    assert kwargs["operation"] == "tts_synthesize"
    assert kwargs["cost_usd"] > 0
    assert kwargs["duration_seconds"] == 2.5
    meta = kwargs["metadata"]
    assert meta["text_chars"] == 1234
    assert meta["provider"] == "elevenlabs"
    assert "fallback_from" not in meta  # 폴백 아님


def test_record_tts_cost_attaches_fallback_metadata():
    fake_sm = MagicMock(name="SessionLocal")
    render_id = uuid.uuid4()

    with patch(
        "app.services.cost_tracker.cost_log.record_once_committed",
        return_value=True,
    ) as inner:
        cost_tracker.record_tts_cost(
            sessionmaker=fake_sm,
            video_render_id=render_id,
            provider="google_tts",
            text_chars=500,
            duration_seconds=1.1,
            fallback_reason="ElevenLabsServerError: HTTP 503",
        )

    _, kwargs = inner.call_args
    meta = kwargs["metadata"]
    assert meta["fallback_from"] == "elevenlabs"
    assert "ElevenLabsServerError" in meta["fallback_reason"]
    # provider 별 단가가 적용되었는지 확인 — google_tts 는 elevenlabs 보다 훨씬 저렴해야 함.
    el_equivalent = cost_tracker.estimate_tts_cost_usd("elevenlabs", 500)
    assert kwargs["cost_usd"] < el_equivalent


def test_record_tts_cost_extra_metadata_merged():
    fake_sm = MagicMock(name="SessionLocal")
    with patch(
        "app.services.cost_tracker.cost_log.record_once_committed",
        return_value=True,
    ) as inner:
        cost_tracker.record_tts_cost(
            sessionmaker=fake_sm,
            video_render_id=uuid.uuid4(),
            provider="elevenlabs",
            text_chars=10,
            extra={"voice_id": "v-123", "model_id": "eleven_multilingual_v2"},
        )

    _, kwargs = inner.call_args
    meta = kwargs["metadata"]
    assert meta["voice_id"] == "v-123"
    assert meta["model_id"] == "eleven_multilingual_v2"
