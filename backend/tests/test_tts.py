"""TTS 서비스 단위 테스트."""
from unittest.mock import patch, AsyncMock, MagicMock

import httpx
import pytest

from app.services.pipeline.tts import (
    TTSError,
    TTSResult,
    synthesize,
    _elevenlabs_synthesize,
    _google_tts_synthesize,
    _parse_audio_duration,
)


# ── TTSResult ────────────────────────────────────────────────────────────────

def test_tts_result():
    r = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=1.5)
    assert r.audio_bytes == b"audio"
    assert r.provider == "elevenlabs"
    assert r.duration_seconds == 1.5


# ── _parse_audio_duration ────────────────────────────────────────────────────

def test_parse_audio_duration_content_duration():
    headers = httpx.Headers({"content-duration": "12.5"})
    assert _parse_audio_duration(headers) == 12.5


def test_parse_audio_duration_x_audio_duration():
    headers = httpx.Headers({"x-audio-duration": "8.3"})
    assert _parse_audio_duration(headers) == 8.3


def test_parse_audio_duration_missing():
    headers = httpx.Headers({})
    assert _parse_audio_duration(headers) is None


def test_parse_audio_duration_invalid():
    headers = httpx.Headers({"content-duration": "not-a-number"})
    assert _parse_audio_duration(headers) is None


# ── _elevenlabs_synthesize ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_elevenlabs_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"fake-audio-mp3"
    mock_resp.headers = httpx.Headers({"content-type": "audio/mpeg"})

    with patch("app.services.pipeline.tts.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await _elevenlabs_synthesize("안녕하세요")

    assert result.provider == "elevenlabs"
    assert result.audio_bytes == b"fake-audio-mp3"
    assert result.duration_seconds > 0


@pytest.mark.asyncio
async def test_elevenlabs_non_retryable_error():
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized"
    mock_resp.headers = httpx.Headers({})

    with patch("app.services.pipeline.tts.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(TTSError, match="401"):
            await _elevenlabs_synthesize("테스트")

    # 재시도 없이 즉시 실패해야 함
    mock_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_elevenlabs_retries_on_429():
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.text = "Rate limited"
    mock_resp_429.headers = httpx.Headers({})

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.content = b"audio-after-retry"
    mock_resp_200.headers = httpx.Headers({})

    with patch("app.services.pipeline.tts.httpx.AsyncClient") as mock_cls, \
         patch("app.services.pipeline.tts.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.post.side_effect = [mock_resp_429, mock_resp_200]
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await _elevenlabs_synthesize("재시도 테스트")

    assert result.audio_bytes == b"audio-after-retry"
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_elevenlabs_max_retries_exceeded():
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "Server Error"
    mock_resp.headers = httpx.Headers({})

    with patch("app.services.pipeline.tts.httpx.AsyncClient") as mock_cls, \
         patch("app.services.pipeline.tts.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(TTSError, match="최대 재시도 초과"):
            await _elevenlabs_synthesize("실패 테스트")

    assert mock_client.post.call_count == 3


@pytest.mark.asyncio
async def test_elevenlabs_timeout_retries():
    with patch("app.services.pipeline.tts.httpx.AsyncClient") as mock_cls, \
         patch("app.services.pipeline.tts.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.TimeoutException("timeout")
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(TTSError, match="최대 재시도 초과"):
            await _elevenlabs_synthesize("타임아웃 테스트")

    assert mock_client.post.call_count == 3


# ── synthesize (폴백) ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_synthesize_elevenlabs_success():
    mock_result = TTSResult(b"audio", "elevenlabs", 0.5)

    with patch("app.services.pipeline.tts._elevenlabs_synthesize", new_callable=AsyncMock, return_value=mock_result):
        result = await synthesize("테스트")

    assert result.provider == "elevenlabs"


@pytest.mark.asyncio
async def test_synthesize_fallback_to_google():
    mock_google_result = TTSResult(b"google-audio", "google_tts", 0.8)

    with patch("app.services.pipeline.tts._elevenlabs_synthesize", new_callable=AsyncMock, side_effect=TTSError("fail")), \
         patch("app.services.pipeline.tts._google_tts_synthesize", return_value=mock_google_result):
        result = await synthesize("폴백 테스트")

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-audio"


@pytest.mark.asyncio
async def test_synthesize_writes_output_file(tmp_path):
    mock_result = TTSResult(b"file-audio", "elevenlabs", 0.3)
    output = tmp_path / "output.mp3"

    with patch("app.services.pipeline.tts._elevenlabs_synthesize", new_callable=AsyncMock, return_value=mock_result):
        await synthesize("파일 테스트", output_path=output)

    assert output.exists()
    assert output.read_bytes() == b"file-audio"


# ── _google_tts_synthesize ───────────────────────────────────────────────────

def test_google_tts_synthesize():
    mock_response = MagicMock()
    mock_response.audio_content = b"google-tts-audio"

    with patch("app.services.pipeline.tts.texttospeech.TextToSpeechClient") as mock_cls:
        mock_client = MagicMock()
        mock_client.synthesize_speech.return_value = mock_response
        mock_cls.return_value = mock_client

        result = _google_tts_synthesize("구글 TTS 테스트")

    assert result.provider == "google_tts"
    assert result.audio_bytes == b"google-tts-audio"
    assert result.duration_seconds > 0
