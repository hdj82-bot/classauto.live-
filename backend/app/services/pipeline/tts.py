"""TTS 서비스 (ElevenLabs primary + Google Cloud TTS fallback)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx
from google.cloud import texttospeech

from app.core.config import settings

logger = logging.getLogger(__name__)


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


async def _elevenlabs_synthesize(text: str) -> TTSResult:
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
        resp.raise_for_status()
    elapsed = time.monotonic() - start

    return TTSResult(audio_bytes=resp.content, provider="elevenlabs", duration_seconds=elapsed)


def _google_tts_synthesize(text: str) -> TTSResult:
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
