"""TTS 서비스 (ElevenLabs primary + Google Cloud TTS fallback)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx
from google.cloud import texttospeech

from app.core.config import settings
from app.core.retry import retry_external

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """TTS 합성 실패."""


class TTSResult:
    def __init__(self, audio_bytes: bytes, provider: str, duration_seconds: float):
        self.audio_bytes = audio_bytes
        self.provider = provider
        self.duration_seconds = duration_seconds


async def synthesize(text: str, output_path: Path | None = None) -> TTSResult:
    """ElevenLabs로 TTS 합성 시도, 실패 시 Google Cloud TTS 폴백."""
    try:
        result = await _elevenlabs_synthesize(text)
        logger.info("ElevenLabs TTS 합성 성공 (%.1f초)", result.duration_seconds)
    except Exception as exc:
        logger.warning("ElevenLabs TTS 실패, Google Cloud TTS로 폴백: %s", exc)
        result = _google_tts_synthesize(text)
        logger.info("Google Cloud TTS 합성 성공 (%.1f초)", result.duration_seconds)

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(result.audio_bytes)

    return result


@retry_external(label="elevenlabs.synthesize")
async def _elevenlabs_synthesize(text: str) -> TTSResult:
    """ElevenLabs TTS API 호출.

    `retry_external` 데코레이터가 통일 재시도 정책(3회·exp backoff)을 적용한다.
    4xx(429 제외) 는 즉시 TTSError 로 raise (재시도 X). 5xx/429/Timeout 만 재시도.
    timeout 은 ElevenLabs 합성 특성상 120s 유지(긴 문장 처리).
    """
    logger.info("ElevenLabs TTS 요청: text_length=%d, voice_id=%s", len(text), settings.ELEVENLABS_VOICE_ID)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": settings.ELEVENLABS_MODEL_ID,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True},
    }

    start = time.monotonic()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code == 200:
        elapsed = time.monotonic() - start
        return TTSResult(
            audio_bytes=resp.content,
            provider="elevenlabs",
            duration_seconds=elapsed,
        )

    # retry_external 의 정책과 합치하도록 4xx/5xx 분기:
    # - 4xx(429 제외): 영구 오류 → TTSError 즉시 raise (데코레이터가 재시도 안 함)
    # - 5xx/429: httpx.HTTPStatusError 로 띄우면 데코레이터가 재시도
    if resp.status_code in (429, 500, 502, 503, 504):
        raise httpx.HTTPStatusError(
            f"ElevenLabs HTTP {resp.status_code}",
            request=resp.request,
            response=resp,
        )
    raise TTSError(f"ElevenLabs API 오류 [{resp.status_code}]: {resp.text[:300]}")


def _google_tts_synthesize(text: str) -> TTSResult:
    logger.info("Google Cloud TTS 요청: text_length=%d, voice=%s", len(text), settings.GOOGLE_TTS_VOICE_NAME)
    if settings.GOOGLE_TTS_CREDENTIALS_JSON:
        credentials_info = json.loads(settings.GOOGLE_TTS_CREDENTIALS_JSON)
        client = texttospeech.TextToSpeechClient.from_service_account_info(credentials_info)
    else:
        client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code=settings.GOOGLE_TTS_LANGUAGE_CODE,
        name=settings.GOOGLE_TTS_VOICE_NAME,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.0, pitch=0.0,
    )

    start = time.monotonic()
    response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
    elapsed = time.monotonic() - start

    return TTSResult(audio_bytes=response.audio_content, provider="google_tts", duration_seconds=elapsed)


def _parse_audio_duration(headers: httpx.Headers) -> float | None:
    """응답 헤더에서 오디오 길이(초)를 추출. 없으면 None."""
    val = headers.get("content-duration") or headers.get("x-audio-duration")
    if val:
        try:
            return float(val)
        except ValueError:
            pass
    return None
