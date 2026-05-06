"""Google Cloud TTS 클라이언트 (ElevenLabs 폴백).

ElevenLabs 가 401/429/5xx 등으로 실패할 때 호출. 마찬가지로 401/429/5xx 를
도메인 예외 클래스로 명시 처리해 호출부 분기를 단순화한다.

google-cloud-texttospeech 라이브러리는 gRPC 기반이라 respx 로 모킹할 수 없다.
테스트에서는 ``texttospeech.TextToSpeechClient`` 를 monkeypatch 한다.
"""
from __future__ import annotations

import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── 도메인 예외 ──────────────────────────────────────────────────────────────


class GoogleTTSError(Exception):
    """Google Cloud TTS 합성 실패 (기반 클래스)."""


class GoogleTTSAuthError(GoogleTTSError):
    """401/403: 인증/권한 실패."""


class GoogleTTSQuotaError(GoogleTTSError):
    """429: 쿼터 / 레이트 리밋."""


class GoogleTTSServerError(GoogleTTSError):
    """5xx / 타임아웃."""


# ── 클라이언트 ──────────────────────────────────────────────────────────────


def _build_client():
    """서비스 계정 JSON 이 있으면 그것으로, 없으면 ADC 로 클라이언트 생성.

    지연 임포트 — google-cloud-texttospeech 가 미설치된 환경(예: 단위 테스트)
    에서 모듈 임포트 단계의 실패를 막기 위해 함수 내부에서 import.
    """
    from google.cloud import texttospeech  # noqa: PLC0415

    creds = (settings.GOOGLE_TTS_CREDENTIALS_JSON or "").strip()
    if creds:
        info = json.loads(creds)
        return texttospeech.TextToSpeechClient.from_service_account_info(info)
    return texttospeech.TextToSpeechClient()


def synthesize(
    text: str,
    *,
    language_code: str | None = None,
    voice_name: str | None = None,
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> bytes:
    """Google Cloud TTS 로 합성. 성공 시 mp3 audio bytes 반환.

    401/429/5xx 는 도메인 예외로 변환해 raise.
    """
    from google.cloud import texttospeech  # noqa: PLC0415
    from google.api_core import exceptions as gax  # noqa: PLC0415

    lang = language_code or settings.GOOGLE_TTS_LANGUAGE_CODE
    voice = voice_name or settings.GOOGLE_TTS_VOICE_NAME

    logger.info(
        "Google TTS 요청: chars=%d, lang=%s, voice=%s", len(text), lang, voice,
    )
    try:
        client = _build_client()
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice_params = texttospeech.VoiceSelectionParams(
            language_code=lang, name=voice,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=speaking_rate,
            pitch=pitch,
        )
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice_params, audio_config=audio_config,
        )
        return response.audio_content
    except gax.Unauthenticated as exc:  # 401
        raise GoogleTTSAuthError(f"Google TTS 401 (Unauthenticated): {exc}") from exc
    except gax.PermissionDenied as exc:  # 403
        raise GoogleTTSAuthError(f"Google TTS 403 (PermissionDenied): {exc}") from exc
    except gax.ResourceExhausted as exc:  # 429
        raise GoogleTTSQuotaError(f"Google TTS 429 (ResourceExhausted): {exc}") from exc
    except (
        gax.InternalServerError,
        gax.ServiceUnavailable,
        gax.DeadlineExceeded,
    ) as exc:  # 5xx / timeout
        raise GoogleTTSServerError(f"Google TTS 5xx/timeout: {exc}") from exc
    except gax.GoogleAPICallError as exc:  # 그 외 4xx
        raise GoogleTTSError(f"Google TTS API 오류: {exc}") from exc
