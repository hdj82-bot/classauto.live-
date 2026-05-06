"""ElevenLabs / Google TTS 클라이언트 통합 테스트.

ElevenLabs 측은 httpx 기반이므로 ``respx`` 로 실 네트워크 호출 직전까지
검증한다 (URL, 헤더, 4xx/5xx/429 분기). respx 가 설치되지 않은 환경에서는
모듈 전체를 skip 한다.

Google TTS 측은 gRPC 라이브러리(``google.cloud.texttospeech``) 기반이라
respx 가 가로챌 수 없어 client 생성을 monkeypatch 해 401/429/5xx 매핑만 검증.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

respx = pytest.importorskip("respx")

from app.services.pipeline import elevenlabs_client, google_tts_client  # noqa: E402


# ── Common fixture ──────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _stub_settings(monkeypatch):
    """테스트용 ElevenLabs/Google 환경값 — 실 키 누락 환경에서도 통과."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "test-elevenlabs-key")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID", "test-voice-default")
    monkeypatch.setattr(settings, "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    monkeypatch.setattr(settings, "GOOGLE_TTS_LANGUAGE_CODE", "ko-KR")
    monkeypatch.setattr(settings, "GOOGLE_TTS_VOICE_NAME", "ko-KR-Neural2-A")
    monkeypatch.setattr(settings, "GOOGLE_TTS_CREDENTIALS_JSON", "")
    # retry 백오프가 실 sleep 하지 않도록 — 단위 테스트가 빨리 끝나야 함.
    import app.core.retry as _retry
    monkeypatch.setattr(_retry.asyncio, "sleep", _no_sleep_async)
    yield


async def _no_sleep_async(_seconds):  # noqa: ARG001
    return None


# ── ElevenLabs synthesize: 200 ───────────────────────────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_200_returns_bytes():
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(return_value=httpx.Response(200, content=b"OK-MP3-BYTES"))

    audio = await elevenlabs_client.synthesize("hello")

    assert audio == b"OK-MP3-BYTES"
    assert route.called
    request = route.calls.last.request
    assert request.headers.get("xi-api-key") == "test-elevenlabs-key"
    assert request.headers.get("accept") == "audio/mpeg"


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_uses_custom_voice_id():
    """voice cloning: 호출자가 voice_id 를 넘기면 URL 에 그대로 포함."""
    custom = "user-cloned-abc"
    route = respx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{custom}"
    ).mock(return_value=httpx.Response(200, content=b"CLONED"))

    audio = await elevenlabs_client.synthesize("voice cloning", voice_id=custom)

    assert audio == b"CLONED"
    assert route.called


# ── ElevenLabs synthesize: 401 (auth) — 즉시 실패, 재시도 X ──────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_401_raises_auth_error_no_retry():
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(return_value=httpx.Response(401, text="Invalid API key"))

    with pytest.raises(elevenlabs_client.ElevenLabsAuthError, match="401"):
        await elevenlabs_client.synthesize("nope")

    assert route.call_count == 1  # 4xx 는 재시도하지 않음


# ── ElevenLabs synthesize: 429 — 재시도 후 QuotaError ────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_429_retries_then_raises_quota():
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(return_value=httpx.Response(429, text="quota_exceeded"))

    with pytest.raises(elevenlabs_client.ElevenLabsQuotaError):
        await elevenlabs_client.synthesize("rate limited")

    # retry_external 의 DEFAULT_MAX_ATTEMPTS=3 — 정확히 3회 호출
    assert route.call_count == 3


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_429_then_200_succeeds_after_retry():
    """429 → 200 시퀀스 — 재시도 후 성공 경로."""
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(side_effect=[
        httpx.Response(429, text="rate"),
        httpx.Response(200, content=b"AFTER-RETRY"),
    ])

    audio = await elevenlabs_client.synthesize("retry me")

    assert audio == b"AFTER-RETRY"
    assert route.call_count == 2


# ── ElevenLabs synthesize: 5xx — 재시도 후 ServerError ───────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_500_retries_then_raises_server_error():
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(return_value=httpx.Response(500, text="boom"))

    with pytest.raises(elevenlabs_client.ElevenLabsServerError):
        await elevenlabs_client.synthesize("server error")

    assert route.call_count == 3


# ── ElevenLabs synthesize: 4xx 기타 — 즉시 raise (재시도 X) ──────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_synthesize_422_raises_immediately():
    route = respx.post(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-default"
    ).mock(return_value=httpx.Response(422, text="invalid voice settings"))

    with pytest.raises(elevenlabs_client.ElevenLabsError):
        await elevenlabs_client.synthesize("bad payload")

    assert route.call_count == 1


# ── ElevenLabs IVC (clone_voice) ─────────────────────────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_clone_voice_success():
    route = respx.post("https://api.elevenlabs.io/v1/voices/add").mock(
        return_value=httpx.Response(
            200, json={"voice_id": "new-cloned-voice-001"},
        ),
    )

    info = await elevenlabs_client.clone_voice(
        "내 목소리",
        audio_files=[("sample.mp3", b"fake-mp3-bytes")],
        description="test sample",
    )

    assert info["voice_id"] == "new-cloned-voice-001"
    assert route.called
    req = route.calls.last.request
    assert req.headers.get("xi-api-key") == "test-elevenlabs-key"


@pytest.mark.asyncio
@respx.mock
async def test_elevenlabs_clone_voice_401():
    respx.post("https://api.elevenlabs.io/v1/voices/add").mock(
        return_value=httpx.Response(401, text="invalid"),
    )
    with pytest.raises(elevenlabs_client.ElevenLabsAuthError):
        await elevenlabs_client.clone_voice("v", [("a.mp3", b"x")])


@pytest.mark.asyncio
async def test_elevenlabs_clone_voice_rejects_empty_samples():
    with pytest.raises(elevenlabs_client.ElevenLabsError, match="음성 샘플"):
        await elevenlabs_client.clone_voice("v", [])


# ── Google TTS 401/429/5xx 매핑 (gRPC 예외 → 도메인 예외) ────────────────────


def _make_gax_exc(name: str, *args):
    """google.api_core.exceptions 의 예외 인스턴스 생성 (있을 때만).

    실제 라이브러리가 없으면 skip — google-cloud-texttospeech 는 requirements.txt
    에 명시돼 있어 통상 설치돼 있다.
    """
    gax = pytest.importorskip("google.api_core.exceptions")
    cls = getattr(gax, name)
    return cls(*args) if args else cls("test")


def test_google_tts_synthesize_maps_unauthenticated_to_auth_error():
    exc = _make_gax_exc("Unauthenticated", "bad creds")
    with patch.object(google_tts_client, "_build_client") as build:
        client = MagicMock()
        client.synthesize_speech.side_effect = exc
        build.return_value = client

        with pytest.raises(google_tts_client.GoogleTTSAuthError):
            google_tts_client.synthesize("hi")


def test_google_tts_synthesize_maps_resource_exhausted_to_quota_error():
    exc = _make_gax_exc("ResourceExhausted", "quota")
    with patch.object(google_tts_client, "_build_client") as build:
        client = MagicMock()
        client.synthesize_speech.side_effect = exc
        build.return_value = client

        with pytest.raises(google_tts_client.GoogleTTSQuotaError):
            google_tts_client.synthesize("hi")


def test_google_tts_synthesize_maps_internal_to_server_error():
    exc = _make_gax_exc("InternalServerError", "boom")
    with patch.object(google_tts_client, "_build_client") as build:
        client = MagicMock()
        client.synthesize_speech.side_effect = exc
        build.return_value = client

        with pytest.raises(google_tts_client.GoogleTTSServerError):
            google_tts_client.synthesize("hi")


def test_google_tts_synthesize_returns_audio_content_on_success():
    fake_response = MagicMock()
    fake_response.audio_content = b"google-bytes"

    with patch.object(google_tts_client, "_build_client") as build:
        client = MagicMock()
        client.synthesize_speech.return_value = fake_response
        build.return_value = client

        audio = google_tts_client.synthesize("hi")

    assert audio == b"google-bytes"
