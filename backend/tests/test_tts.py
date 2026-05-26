"""TTS orchestrator + 도메인 예외 변환 단위 테스트.

새 구조:
- tts.synthesize: ElevenLabs 시도 → 실패 시 Google TTS 폴백 → 둘 다 실패 시 TTSError
- elevenlabs_client / google_tts_client 의 도메인 예외를 패치해 흐름만 검증
- 실 HTTP 호출은 test_tts_clients.py (respx) 에서 검증

DoD 매핑 (요건):
1. ElevenLabs 성공                       → test_synthesize_elevenlabs_success
2. ElevenLabs 5xx → 폴백                 → test_synthesize_falls_back_on_elevenlabs_server_error
3. 폴백도 실패                           → test_synthesize_raises_when_both_providers_fail
4. 쿼터 (429)                            → test_synthesize_falls_back_on_quota_error
5. voice cloning 분기                     → test_synthesize_passes_custom_voice_id_through
6. 비용 기록                              → test_synthesize_records_cost_when_sessionmaker_given
"""
from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.pipeline import elevenlabs_client, google_tts_client, tts
from app.services.pipeline.tts import (
    TTSError,
    TTSResult,
    _elevenlabs_synthesize,
    _google_tts_synthesize,
    _parse_audio_duration,
    synthesize,
)


# ── TTSResult ────────────────────────────────────────────────────────────────


def test_tts_result_basic():
    r = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=1.5)
    assert r.audio_bytes == b"audio"
    assert r.provider == "elevenlabs"
    assert r.duration_seconds == 1.5
    assert r.text_chars == 0
    assert r.fallback_reason is None


def test_tts_result_with_extras():
    r = TTSResult(
        audio_bytes=b"a",
        provider="google_tts",
        duration_seconds=0.8,
        text_chars=42,
        fallback_reason="ElevenLabsServerError: oops",
    )
    assert r.text_chars == 42
    assert r.fallback_reason and "ElevenLabsServerError" in r.fallback_reason


# ── _parse_audio_duration ────────────────────────────────────────────────────


def test_parse_audio_duration_content_duration():
    headers = httpx.Headers({"content-duration": "12.5"})
    assert _parse_audio_duration(headers) == 12.5


def test_parse_audio_duration_x_audio_duration():
    headers = httpx.Headers({"x-audio-duration": "8.3"})
    assert _parse_audio_duration(headers) == 8.3


def test_parse_audio_duration_missing():
    assert _parse_audio_duration(httpx.Headers({})) is None


def test_parse_audio_duration_invalid():
    headers = httpx.Headers({"content-duration": "not-a-number"})
    assert _parse_audio_duration(headers) is None


# ── synthesize: 1차 (ElevenLabs) 성공 경로 ─────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_elevenlabs_success():
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"el-audio",
    ) as el_mock, patch.object(
        google_tts_client, "synthesize", side_effect=AssertionError("Google 호출되면 안 됨"),
    ):
        result = await synthesize("안녕하세요")

    assert result.provider == "elevenlabs"
    assert result.audio_bytes == b"el-audio"
    assert result.text_chars == len("안녕하세요")
    assert result.fallback_reason is None
    el_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_synthesize_passes_custom_voice_id_through():
    """voice cloning 분기: caller 가 voice_id 를 전달하면 ElevenLabs client 까지 그대로 전달."""
    cloned_voice = "cloned-user-12345"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"cloned-audio",
    ) as el_mock:
        result = await synthesize("내 목소리로", voice_id=cloned_voice)

    assert result.provider == "elevenlabs"
    el_mock.assert_awaited_once()
    _, kwargs = el_mock.call_args
    assert kwargs.get("voice_id") == cloned_voice


# ── synthesize: 2차 폴백 (Google TTS) 경로 ─────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_falls_back_on_elevenlabs_server_error():
    """ElevenLabs 5xx → ElevenLabsServerError → Google 호출."""
    el_exc = elevenlabs_client.ElevenLabsServerError("HTTP 502 retries exhausted")

    def google_sync(text):  # google_tts_client.synthesize 는 sync
        return b"google-audio"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=el_exc,
    ), patch.object(google_tts_client, "synthesize", side_effect=google_sync) as g_mock:
        result = await synthesize("폴백 발동")

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-audio"
    assert result.fallback_reason is not None
    assert "ElevenLabsServerError" in result.fallback_reason
    g_mock.assert_called_once()


@pytest.mark.asyncio
async def test_synthesize_falls_back_on_quota_error():
    """ElevenLabs 쿼터 초과 (429) → ElevenLabsQuotaError → Google 호출."""
    el_exc = elevenlabs_client.ElevenLabsQuotaError("HTTP 429 quota")

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=el_exc,
    ), patch.object(
        google_tts_client, "synthesize", return_value=b"google-quota-fallback",
    ):
        result = await synthesize("쿼터 폴백")

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-quota-fallback"
    assert result.fallback_reason and "ElevenLabsQuotaError" in result.fallback_reason


@pytest.mark.asyncio
async def test_synthesize_falls_back_on_auth_error():
    """ElevenLabs 401 (auth) 도 일관되게 폴백 — 운영 중 한 provider 가 죽어도 영상 생성 지속."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsAuthError("ELEVENLABS_API_KEY invalid"),
    ), patch.object(
        google_tts_client, "synthesize", return_value=b"auth-fallback",
    ):
        result = await synthesize("auth 폴백")

    assert result.provider == "google_tts"
    assert result.fallback_reason and "ElevenLabsAuthError" in result.fallback_reason


@pytest.mark.asyncio
async def test_synthesize_raises_when_both_providers_fail():
    """ElevenLabs 5xx → Google 도 5xx → TTSError 통합."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsServerError("HTTP 503"),
    ), patch.object(
        google_tts_client, "synthesize",
        side_effect=google_tts_client.GoogleTTSServerError("INTERNAL"),
    ):
        with pytest.raises(TTSError, match="폴백도 실패"):
            await synthesize("실패 케이스")


@pytest.mark.asyncio
async def test_synthesize_rejects_empty_text():
    with pytest.raises(TTSError, match="비어있어"):
        await synthesize("")


@pytest.mark.asyncio
async def test_synthesize_writes_output_file(tmp_path: Path):
    output = tmp_path / "out.mp3"
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"file-audio",
    ):
        await synthesize("파일 저장 테스트", output_path=output)

    assert output.exists()
    assert output.read_bytes() == b"file-audio"


# ── synthesize: 비용 기록 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_records_cost_when_sessionmaker_given():
    """sessionmaker + video_render_id 가 모두 주어지면 cost_tracker.record_tts_cost 호출."""
    fake_sessionmaker = MagicMock(name="SessionLocal")
    render_id = uuid.uuid4()

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"audio",
    ), patch("app.services.cost_tracker.record_tts_cost", return_value=True) as cost_mock:
        result = await synthesize(
            "비용 테스트 텍스트",
            sessionmaker=fake_sessionmaker,
            video_render_id=render_id,
        )

    assert result.provider == "elevenlabs"
    cost_mock.assert_called_once()
    _, kwargs = cost_mock.call_args
    assert kwargs["sessionmaker"] is fake_sessionmaker
    assert kwargs["video_render_id"] == render_id
    assert kwargs["provider"] == "elevenlabs"
    assert kwargs["text_chars"] == len("비용 테스트 텍스트")
    assert kwargs["fallback_reason"] is None


@pytest.mark.asyncio
async def test_synthesize_cost_records_fallback_reason():
    """폴백 발동 시 cost_tracker.record_tts_cost 에 fallback_reason 전달."""
    fake_sessionmaker = MagicMock(name="SessionLocal")
    render_id = uuid.uuid4()

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsQuotaError("HTTP 429"),
    ), patch.object(
        google_tts_client, "synthesize", return_value=b"g",
    ), patch("app.services.cost_tracker.record_tts_cost", return_value=True) as cost_mock:
        await synthesize(
            "폴백 비용",
            sessionmaker=fake_sessionmaker,
            video_render_id=render_id,
        )

    cost_mock.assert_called_once()
    _, kwargs = cost_mock.call_args
    assert kwargs["provider"] == "google_tts"
    assert kwargs["fallback_reason"] is not None
    assert "ElevenLabsQuotaError" in kwargs["fallback_reason"]


@pytest.mark.asyncio
async def test_synthesize_skips_cost_when_not_provided():
    """sessionmaker 가 None 이면 record_tts_cost 호출하지 않음."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, return_value=b"a",
    ), patch("app.services.cost_tracker.record_tts_cost") as cost_mock:
        await synthesize("스킵")

    cost_mock.assert_not_called()


# ── 후방 호환 헬퍼 (_elevenlabs_synthesize / _google_tts_synthesize) ────────


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_helper_wraps_audio():
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, return_value=b"x",
    ):
        result = await _elevenlabs_synthesize("hi")
    assert isinstance(result, TTSResult)
    assert result.provider == "elevenlabs"
    assert result.audio_bytes == b"x"
    assert result.duration_seconds >= 0


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_helper_translates_errors():
    """ElevenLabsAuthError → TTSError("...401...")."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsAuthError("bad key"),
    ):
        with pytest.raises(TTSError, match="401"):
            await _elevenlabs_synthesize("hi")


def test_google_tts_synthesize_helper_wraps_audio():
    with patch.object(
        google_tts_client, "synthesize", return_value=b"g-bytes",
    ):
        result = _google_tts_synthesize("안녕")
    assert result.provider == "google_tts"
    assert result.audio_bytes == b"g-bytes"


def test_google_tts_synthesize_helper_translates_errors():
    with patch.object(
        google_tts_client, "synthesize",
        side_effect=google_tts_client.GoogleTTSServerError("503"),
    ):
        with pytest.raises(TTSError, match="Google TTS"):
            _google_tts_synthesize("hi")


# ── 발화 속도(speed) 전달 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_forwards_speed_to_elevenlabs():
    """caller 가 넘긴 speed 가 ElevenLabs client 까지 그대로 전달된다."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, return_value=b"a",
    ) as el_mock:
        await synthesize("속도 적용", speed=0.85)
    _, kwargs = el_mock.call_args
    assert kwargs.get("speed") == 0.85


@pytest.mark.asyncio
async def test_google_fallback_receives_speaking_rate_for_non_default_speed():
    """비기본 speed 면 Google 폴백에 speaking_rate 로 전달된다."""
    el_exc = elevenlabs_client.ElevenLabsServerError("5xx")
    captured: dict = {}

    def google_sync(text, **kwargs):
        captured.update(kwargs)
        return b"g"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=el_exc,
    ), patch.object(google_tts_client, "synthesize", side_effect=google_sync):
        result = await synthesize("폴백 속도", speed=0.8)

    assert result.provider == "google_tts"
    assert captured.get("speaking_rate") == 0.8


@pytest.mark.asyncio
async def test_synthesize_falls_back_on_non_domain_elevenlabs_error():
    """ElevenLabsError 가 아닌 예외(예: httpx.ConnectError)도 Google 폴백으로 흘린다.

    과거엔 ElevenLabsError 만 잡아, 변환 안 된 연결오류가 그대로 새어 호출부에서
    핸들링 안 된 500(미리듣기 CORS 누수)을 유발했다.
    """
    import httpx

    conn_err = httpx.ConnectError("connection refused")
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=conn_err,
    ), patch.object(google_tts_client, "synthesize", return_value=b"google-after-connerr"):
        result = await synthesize("연결오류 폴백")

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-after-connerr"
    assert "ConnectError" in (result.fallback_reason or "")


# ── 언어 구간 분리 합성 (중국어 발음 정확화) ─────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_korean_only_is_single_elevenlabs_call():
    """순수 한국어는 구간이 1개 → ElevenLabs 1회 호출(기존 동작 유지)."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"ko-audio",
    ) as el_mock:
        result = await synthesize("안녕하세요. 어순을 배웁니다.")

    assert result.audio_bytes == b"ko-audio"
    el_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_synthesize_mixed_uses_v3_single_call():
    """중국어가 섞인 스크립트는 eleven_v3 단일 호출(코드스위칭)로 합성한다.

    구간 분리/이어붙임 없이 한 번에 → 끊김 없음. model_id 가 v3 로 전달되고
    합성이 1회만 일어나는지(분리 안 함) 검증.
    """
    captured: dict = {}

    def fake_el(text, **kwargs):
        captured["model_id"] = kwargs.get("model_id")
        captured["calls"] = captured.get("calls", 0) + 1
        return b"v3-audio"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ), patch.object(
        tts, "_concat_mp3", side_effect=AssertionError("v3 경로는 concat 하면 안 됨"),
    ):
        result = await synthesize('여기서 "我吃饭"는 나는 밥을 먹는다 입니다.')

    assert result.provider == "elevenlabs"
    assert result.audio_bytes == b"v3-audio"
    assert captured["model_id"] == "eleven_v3"  # v3 모델로 합성
    assert captured["calls"] == 1               # 단일 호출(구간 분리 안 함)


@pytest.mark.asyncio
async def test_synthesize_v3_failure_falls_back_to_v2_segmentation():
    """v3 합성 실패 시 v2 구간 분리로 폴백한다(Google 까지 안 가고 ElevenLabs 유지)."""

    def fake_el(text, **kwargs):
        if kwargs.get("model_id") == "eleven_v3":
            raise elevenlabs_client.ElevenLabsServerError("v3 down")
        return b"seg"  # v2 구간 합성은 성공

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ), patch.object(
        tts, "_concat_mp3", side_effect=lambda parts: b"".join(parts),
    ), patch.object(
        google_tts_client, "synthesize",
        side_effect=AssertionError("Google 폴백까지 가면 안 됨"),
    ):
        result = await synthesize('여기서 "我"는 나는 입니다.')

    assert result.provider == "elevenlabs"   # v2 폴백 성공 → ElevenLabs 유지
    assert result.fallback_reason is None    # Google 폴백 아님
    assert b"seg" in result.audio_bytes


@pytest.mark.asyncio
async def test_synthesize_mixed_falls_back_to_google_when_elevenlabs_down():
    """중국어 혼합 텍스트에서 v3·v2 둘 다 ElevenLabs 실패 → 전체 텍스트 Google 폴백."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsServerError("5xx"),
    ), patch.object(
        google_tts_client, "synthesize", return_value=b"google-whole",
    ):
        result = await synthesize('"我"는 나는 이라는 뜻입니다.')

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-whole"
    assert result.fallback_reason and "ElevenLabsServerError" in result.fallback_reason


def test_concat_mp3_single_and_empty():
    """_concat_mp3: 1개면 그대로, 빈 입력이면 b''."""
    assert tts._concat_mp3([b"only"]) == b"only"
    assert tts._concat_mp3([]) == b""
    assert tts._concat_mp3([b"", b""]) == b""


def test_concat_mp3_byte_join_fallback_when_no_ffmpeg():
    """ffmpeg 미설치 시 바이트 단순 연결로 병합(graceful degrade)."""
    with patch.object(tts.shutil, "which", return_value=None):
        assert tts._concat_mp3([b"aa", b"bb", b"cc"]) == b"aabbcc"


# ── 모듈 export sanity ──────────────────────────────────────────────────────


def test_module_exports():
    """기존 caller 가 import 하는 심볼이 그대로 살아있는지 확인."""
    assert hasattr(tts, "synthesize")
    assert hasattr(tts, "TTSResult")
    assert hasattr(tts, "TTSError")
