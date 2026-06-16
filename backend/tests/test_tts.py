"""TTS orchestrator 단위 테스트 (ElevenLabs eleven_v3 전용 — 폴백 없음).

정책(2026-06-16 교수자): 모든 음성은 ElevenLabs eleven_v3 로만 합성한다.
- v2(multilingual_v2)·언어 구간분리 폴백 없음.
- Google TTS 등 타 서비스 폴백 없음.
- 합성 실패는 다른 경로로 우회하지 않고 ``TTSError`` 로 그대로 올린다.

elevenlabs_client 의 도메인 예외를 패치해 흐름만 검증한다. 실 HTTP 호출은
test_tts_clients.py (respx) 에서 검증.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.pipeline import elevenlabs_client, tts
from app.services.pipeline.tts import (
    TTSError,
    TTSResult,
    _elevenlabs_synthesize,
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
        provider="elevenlabs",
        duration_seconds=0.8,
        text_chars=42,
        subtitle_cues=[{"start": 0.0, "end": 1.0, "text": "안녕"}],
    )
    assert r.text_chars == 42
    assert r.subtitle_cues and r.subtitle_cues[0]["text"] == "안녕"


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


# ── synthesize: ElevenLabs v3 성공 경로 ─────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_elevenlabs_success():
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"el-audio",
    ) as el_mock:
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


# ── synthesize: 폴백 금지 — ElevenLabs 실패는 곧 TTSError ───────────────────
# 정책상 v2·Google 등 다른 경로로 우회하지 않고, 실패 원인을 그대로 올린다.


@pytest.mark.asyncio
async def test_synthesize_raises_on_elevenlabs_server_error():
    """ElevenLabs 5xx → 폴백 없이 TTSError(원인 포함)."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsServerError("HTTP 502 retries exhausted"),
    ):
        with pytest.raises(TTSError, match="ElevenLabs v3 합성 실패"):
            await synthesize("실패 케이스")


@pytest.mark.asyncio
async def test_synthesize_raises_on_quota_error():
    """ElevenLabs 429 → 폴백 없이 TTSError."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsQuotaError("HTTP 429 quota"),
    ):
        with pytest.raises(TTSError, match="ElevenLabsQuotaError"):
            await synthesize("쿼터 실패")


@pytest.mark.asyncio
async def test_synthesize_raises_on_auth_error():
    """ElevenLabs 401 → 폴백 없이 TTSError(다른 provider 로 우회 금지)."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsAuthError("ELEVENLABS_API_KEY invalid"),
    ):
        with pytest.raises(TTSError, match="ElevenLabsAuthError"):
            await synthesize("auth 실패")


@pytest.mark.asyncio
async def test_synthesize_raises_on_non_domain_elevenlabs_error():
    """ElevenLabsError 가 아닌 예외(예: httpx.ConnectError)도 폴백 없이 TTSError 로 올린다."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        side_effect=httpx.ConnectError("connection refused"),
    ):
        with pytest.raises(TTSError, match="ConnectError"):
            await synthesize("연결오류")


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
async def test_synthesize_skips_cost_when_not_provided():
    """sessionmaker 가 None 이면 record_tts_cost 호출하지 않음."""
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, return_value=b"a",
    ), patch("app.services.cost_tracker.record_tts_cost") as cost_mock:
        await synthesize("스킵")

    cost_mock.assert_not_called()


# ── 후방 호환 헬퍼 (_elevenlabs_synthesize) ─────────────────────────────────


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


# ── 발화 속도(speed): v3 는 API 미전달 + atempo 후처리 ──────────────────────


@pytest.mark.asyncio
async def test_synthesize_v3_applies_speed_via_atempo_not_api():
    """v3 는 speed 를 API 로 안 보내고(미지원) ffmpeg atempo 로 적용한다."""
    captured: dict = {}

    def fake_el(text, **kwargs):
        captured["speed"] = kwargs.get("speed")
        captured["model_id"] = kwargs.get("model_id")
        return b"v3"

    atempo: dict = {}

    def fake_atempo(audio, factor):  # noqa: ARG001
        atempo["factor"] = factor
        return b"sped"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ), patch.object(tts, "_apply_atempo", side_effect=fake_atempo):
        result = await synthesize("속도 적용 테스트", speed=0.85)

    assert captured["model_id"] == "eleven_v3"  # v3 모델로 합성
    assert captured["speed"] is None            # speed 는 API 로 미전달
    assert round(atempo["factor"], 3) == 0.85   # atempo 로 0.85 적용
    assert result.audio_bytes == b"sped"


# ── eleven_v3 단일 호출 (한·중 코드스위칭) ───────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_korean_only_is_single_v3_call():
    """순수 한국어도 eleven_v3 단일 호출(구간 분리 없음)."""
    captured: dict = {}

    def fake_el(text, **kwargs):
        captured["model_id"] = kwargs.get("model_id")
        captured["calls"] = captured.get("calls", 0) + 1
        return b"ko-audio"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ):
        result = await synthesize("안녕하세요. 어순을 배웁니다.")

    assert result.audio_bytes == b"ko-audio"
    assert captured["model_id"] == "eleven_v3"
    assert captured["calls"] == 1


@pytest.mark.asyncio
async def test_synthesize_mixed_uses_v3_single_call():
    """중국어가 섞인 스크립트도 eleven_v3 단일 호출(코드스위칭)로 합성한다.

    구간 분리/이어붙임 없이 한 번에 → 끊김·발음 깨짐 없음.
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
async def test_synthesize_v3_failure_raises_no_v2_fallback():
    """v3 합성 실패 시 v2 구간 분리로 폴백하지 않고 TTSError 로 올린다(폴백 금지)."""

    def fake_el(text, **kwargs):
        if kwargs.get("model_id") == "eleven_v3":
            raise elevenlabs_client.ElevenLabsServerError("v3 down")
        raise AssertionError("v3 외 모델(v2) 로 재시도하면 안 됨")

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ):
        with pytest.raises(TTSError, match="ElevenLabs v3 합성 실패"):
            await synthesize('여기서 "我"는 나는 입니다.')


# ── 클론(IVC) 음성: v3 전용 (폴백 없음) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_cloned_uses_v3():
    """cloned=True 면 (기본 CLONE=eleven_v3) v3 단일 호출로 합성한다.

    v3 는 stability 만 의미가 있어 클론 튜닝키(similarity_boost 등)는 싣지 않는다.
    """
    captured: dict = {}

    def fake_el(text, **kwargs):
        captured["model_id"] = kwargs.get("model_id")
        captured["voice_settings"] = kwargs.get("voice_settings")
        captured["calls"] = captured.get("calls", 0) + 1
        return b"clone-audio"

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ):
        result = await synthesize(
            "안녕하세요. 본인 목소리 미리보기.", voice_id="cloned-voice-1", cloned=True,
        )

    assert result.provider == "elevenlabs"
    assert result.audio_bytes == b"clone-audio"
    assert captured["model_id"] == "eleven_v3"   # v3 전용
    assert captured["calls"] == 1                 # 한 번에(코드스위칭) 합성
    assert "similarity_boost" not in captured["voice_settings"]


@pytest.mark.asyncio
async def test_synthesize_cloned_v3_failure_raises_no_v2_fallback():
    """클론 v3 합성이 실패해도 v2 로 폴백하지 않고 TTSError 로 올린다(폴백 금지)."""
    seen: list = []

    def fake_el(text, **kwargs):
        model = kwargs.get("model_id")
        seen.append(model)
        if model == "eleven_v3":
            raise elevenlabs_client.ElevenLabsServerError("v3 down")
        raise AssertionError("v3 외 모델(v2) 로 재시도하면 안 됨")

    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock, side_effect=fake_el,
    ):
        with pytest.raises(TTSError, match="ElevenLabs v3 합성 실패"):
            await synthesize(
                "안녕하세요. 본인 목소리.", voice_id="cloned-voice-1", cloned=True,
            )

    assert seen == ["eleven_v3"]  # v3 만 시도, v2 재시도 없음


# ── _concat_mp3 (mp3 결합 유틸 — 자막/병합 등에서 재사용 가능) ────────────────


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
