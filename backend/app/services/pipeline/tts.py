"""TTS 파이프라인 (ElevenLabs primary + Google Cloud TTS fallback).

orchestrator. 실 HTTP 호출은 ``elevenlabs_client`` / ``google_tts_client`` 가
담당하며, 이 모듈은 다음 책임만 갖는다.

1. 1차: ElevenLabs (settings.ELEVENLABS_VOICE_ID 또는 호출자가 넘긴 cloned voice).
2. 2차: ElevenLabs 가 ``ElevenLabsError`` 계열을 raise 하면 Google TTS 로 폴백.
3. 두 provider 모두 실패하면 ``TTSError`` 로 통합 raise.
4. 폴백 발생 시 별도 WARNING 로그 + (선택) cost_logs.metadata 에 reason 기록.
5. (선택) S3 또는 로컬 파일로 audio bytes 저장.

후방 호환:
- ``TTSResult``, ``TTSError``, ``synthesize`` 의 시그니처는 기존 caller
  (app/tasks/render.py, e2e/idempotency 테스트) 가 의존하므로 그대로 유지.
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

from app.services.pipeline import elevenlabs_client, google_tts_client

if TYPE_CHECKING:
    import uuid

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """TTS 합성 실패 (ElevenLabs 와 Google 모두 실패)."""


class TTSResult:
    """합성 결과.

    audio_bytes: mp3 audio
    provider: "elevenlabs" | "google_tts"
    duration_seconds: 호출+합성에 걸린 wall-clock (오디오 길이 아님)
    text_chars: 입력 텍스트 글자수 (단가 계산 / 회계용)
    fallback_reason: ElevenLabs 실패로 Google 로 폴백한 경우 예외 클래스명+메시지
    """

    def __init__(
        self,
        audio_bytes: bytes,
        provider: str,
        duration_seconds: float,
        text_chars: int = 0,
        fallback_reason: str | None = None,
    ):
        self.audio_bytes = audio_bytes
        self.provider = provider
        self.duration_seconds = duration_seconds
        self.text_chars = text_chars
        self.fallback_reason = fallback_reason


# ── 메인 진입점 ──────────────────────────────────────────────────────────────


async def synthesize(
    text: str,
    output_path: Path | None = None,
    *,
    voice_id: str | None = None,
    gender: str | None = None,
    speed: float | None = None,
    sessionmaker=None,
    video_render_id: uuid.UUID | None = None,
    s3_render_id: str | None = None,
) -> TTSResult:
    """ElevenLabs 합성 시도, 실패 시 Google TTS 폴백.

    voice_id: ElevenLabs voice ID. None 이면 ``elevenlabs_client.pick_voice_id(gender)``.
              교수자가 음성 패널에서 고른 보이스를 흘려보내는 용도.
    gender:   ``"male"`` | ``"female"`` — voice_id 가 None 일 때 _MALE/_FEMALE 분기 키.
              Lecture.voice_gender 를 흘려보내는 용도.
    speed:    발화 속도 배율(1.0 = 기본). ElevenLabs 는 voice_settings.speed(0.7~1.2
              로 클램프), Google 폴백은 speaking_rate 로 전달한다.
    sessionmaker, video_render_id: 둘 다 주어지면 cost_logs 에 즉시 기록.
                                   (별도 트랜잭션 — record_once_committed 위임)
    s3_render_id: 주어지면 audio 를 S3 의 표준 경로에 업로드.
    output_path: 주어지면 로컬 파일에도 동시 저장 (개발/디버깅용).
    """
    if not text or not text.strip():
        raise TTSError("text 가 비어있어 합성 불가")

    fallback_reason: str | None = None
    start = time.monotonic()
    try:
        audio_bytes = await elevenlabs_client.synthesize(
            text, voice_id=voice_id, gender=gender, speed=speed,
        )
        provider = "elevenlabs"
        logger.info(
            "ElevenLabs TTS 합성 성공: chars=%d, voice_id=%s, gender=%s, speed=%s",
            len(text), voice_id or "<default>", gender or "<default>", speed or 1.0,
        )
    except elevenlabs_client.ElevenLabsError as exc:
        fallback_reason = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "ElevenLabs 합성 실패 → Google TTS 폴백 트리거: %s", fallback_reason,
        )
        try:
            audio_bytes = await _run_google_tts(text, speed=speed)
            provider = "google_tts"
            logger.info(
                "Google TTS 폴백 합성 성공: chars=%d, original_failure=%s",
                len(text), fallback_reason,
            )
        except google_tts_client.GoogleTTSError as g_exc:
            logger.error(
                "TTS 양쪽 provider 모두 실패: elevenlabs=%s, google=%s",
                fallback_reason, g_exc,
            )
            raise TTSError(
                f"TTS 폴백도 실패: elevenlabs={fallback_reason}; google={g_exc}"
            ) from g_exc
    elapsed = time.monotonic() - start

    result = TTSResult(
        audio_bytes=audio_bytes,
        provider=provider,
        duration_seconds=elapsed,
        text_chars=len(text),
        fallback_reason=fallback_reason,
    )

    # ── 비용 기록 (선택) ─────────────────────────────────────────────────
    if sessionmaker is not None and video_render_id is not None:
        # 지연 임포트 — cost_tracker → cost_log 의존 사이클 회피, 테스트 모킹 단순화.
        from app.services import cost_tracker  # noqa: PLC0415

        cost_tracker.record_tts_cost(
            sessionmaker=sessionmaker,
            video_render_id=video_render_id,
            provider=provider,
            text_chars=len(text),
            duration_seconds=elapsed,
            fallback_reason=fallback_reason,
        )

    # ── 저장 (선택) ──────────────────────────────────────────────────────
    if s3_render_id is not None:
        # 지연 임포트 — boto3 미설정 환경(단위 테스트) 에서도 import 단계 통과.
        from app.services.pipeline import s3 as s3_svc  # noqa: PLC0415

        try:
            s3_url = s3_svc.upload_audio_bytes(audio_bytes, s3_render_id)
            logger.info("TTS audio S3 업로드: render_id=%s, url=%s", s3_render_id, s3_url)
        except Exception as exc:
            # S3 업로드 실패는 caller 가 결정 — 여기서는 로깅만 (메인 트랜잭션 보호)
            logger.error("TTS audio S3 업로드 실패: render_id=%s, error=%s", s3_render_id, exc)
            raise

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_bytes)

    logger.info(
        "TTS 합성 완료: provider=%s, chars=%d, %.2fs, fallback=%s",
        provider, len(text), elapsed, bool(fallback_reason),
    )
    return result


async def _run_google_tts(text: str, *, speed: float | None = None) -> bytes:
    """Google TTS (gRPC sync) 를 비동기 컨텍스트에서 실행 — 스레드 오프로드.

    speed: 발화 속도 배율. 1.0(기본)·None 이면 speaking_rate 를 넘기지 않고
           기본 호출(elevenlabs 분기와 동일하게 1.0 은 미지정). 그 외에는
           Google speaking_rate(유효범위 0.25~4.0 로 클램프)로 전달한다.
    """
    if speed is None or abs(float(speed) - 1.0) < 1e-9:
        return await asyncio.to_thread(google_tts_client.synthesize, text)
    rate = max(0.25, min(4.0, float(speed)))
    return await asyncio.to_thread(
        lambda: google_tts_client.synthesize(text, speaking_rate=rate)
    )


# ── 후방 호환 헬퍼 ───────────────────────────────────────────────────────────
# 기존 caller 와 외부 단위 테스트가 이 이름들을 import 한다. 새 클라이언트 모듈을
# 위임 호출하도록 구현해 시그니처와 도메인 예외 변환 동작만 보존한다.


async def _elevenlabs_synthesize(text: str) -> TTSResult:
    """``elevenlabs_client.synthesize`` 위임. ElevenLabsError → TTSError."""
    start = time.monotonic()
    try:
        audio = await elevenlabs_client.synthesize(text)
    except elevenlabs_client.ElevenLabsAuthError as exc:
        raise TTSError(f"ElevenLabs 인증 실패 (401): {exc}") from exc
    except elevenlabs_client.ElevenLabsQuotaError as exc:
        raise TTSError(f"ElevenLabs 쿼터 초과 (429) — 최대 재시도 초과: {exc}") from exc
    except elevenlabs_client.ElevenLabsServerError as exc:
        raise TTSError(f"ElevenLabs 서버 오류 — 최대 재시도 초과: {exc}") from exc
    except elevenlabs_client.ElevenLabsError as exc:
        raise TTSError(f"ElevenLabs 호출 실패: {exc}") from exc
    elapsed = time.monotonic() - start
    return TTSResult(
        audio_bytes=audio,
        provider="elevenlabs",
        duration_seconds=elapsed,
        text_chars=len(text),
    )


def _google_tts_synthesize(text: str) -> TTSResult:
    """``google_tts_client.synthesize`` 위임. GoogleTTSError → TTSError."""
    start = time.monotonic()
    try:
        audio = google_tts_client.synthesize(text)
    except google_tts_client.GoogleTTSError as exc:
        raise TTSError(f"Google TTS 호출 실패: {exc}") from exc
    elapsed = time.monotonic() - start
    return TTSResult(
        audio_bytes=audio,
        provider="google_tts",
        duration_seconds=elapsed,
        text_chars=len(text),
    )


def _parse_audio_duration(headers: httpx.Headers) -> float | None:
    """응답 헤더에서 오디오 길이(초)를 추출. 없으면 None.

    ElevenLabs 가 ``content-duration`` / ``x-audio-duration`` 헤더를 일관되게
    내려보내지는 않으므로, 추후 정확한 단가 계산이 필요할 때 보조 수단으로 사용.
    """
    val = headers.get("content-duration") or headers.get("x-audio-duration")
    if val:
        try:
            return float(val)
        except ValueError:
            pass
    return None
