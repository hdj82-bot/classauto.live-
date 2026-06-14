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
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from app.core.config import settings
from app.services.pipeline import elevenlabs_client, google_tts_client
from app.services.pipeline.text_cleanup import (
    split_by_language,
    strip_pinyin_annotations,
)

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
        subtitle_cues: list[dict] | None = None,
    ):
        self.audio_bytes = audio_bytes
        self.provider = provider
        self.duration_seconds = duration_seconds
        self.text_chars = text_chars
        self.fallback_reason = fallback_reason
        # 자막 정밀 싱크용 문장 cue. with_alignment=True 로 호출하고 Forced Alignment
        # 가 성공했을 때만 채워진다. 형식: [{"start","end","text"}, ...] (이 음원의
        # 자체 타임라인 기준 초). None = 정렬 미수행/실패 → 호출부 폴백.
        self.subtitle_cues = subtitle_cues


# ── 메인 진입점 ──────────────────────────────────────────────────────────────


async def synthesize(
    text: str,
    output_path: Path | None = None,
    *,
    voice_id: str | None = None,
    gender: str | None = None,
    speed: float | None = None,
    cloned: bool = False,
    with_alignment: bool = False,
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
    with_alignment: True 면 최종 음원에 대해 Forced Alignment 를 돌려 자막 정밀
              싱크용 문장 cue(TTSResult.subtitle_cues)를 만든다. 합성 경로와
              독립적이며 실패해도 cues=None 으로 degrade(예외 전파 없음). 슬라이드쇼
              본문 렌더에서만 켠다(미리듣기 등은 불필요).
    cloned:   교수자 본인 목소리(Instant Voice Cloning)면 True. 이 경우 eleven_v3
              가 아니라 ``ELEVENLABS_MODEL_ID_CLONE``(multilingual_v2)+클론 튜닝
              세팅으로 합성한다(클론 fidelity 안정화). v3 는 similarity_boost 등
              클론 튜닝 키를 무시하므로 클론에는 부적합.
    sessionmaker, video_render_id: 둘 다 주어지면 cost_logs 에 즉시 기록.
                                   (별도 트랜잭션 — record_once_committed 위임)
    s3_render_id: 주어지면 audio 를 S3 의 표준 경로에 업로드.
    output_path: 주어지면 로컬 파일에도 동시 저장 (개발/디버깅용).
    """
    if not text or not text.strip():
        raise TTSError("text 가 비어있어 합성 불가")

    # 한자 뒤 병음 괄호 표기는 합성기가 로마자를 그대로 읽어 발음을 깨뜨린다.
    # 생성 단계에서 1차 제거하지만, 이미 병음이 박힌 기존 스크립트·교수자 수동
    # 편집본도 깨끗하게 발화되도록 합성 직전에 한 번 더 제거한다(ElevenLabs·
    # Google 폴백·미리듣기 모두 이 경로를 거친다).
    text = strip_pinyin_annotations(text)

    fallback_reason: str | None = None
    speed_provider = "elevenlabs"
    start = time.monotonic()
    try:
        # 중국어가 섞인 스크립트는 eleven_v3 단일 호출(코드스위칭)로 합성해 한·중
        # 전환을 한 음원에서 처리한다(구간 분리·이어붙임 없음 → 멈춤/끊김 제거).
        # 순수 한국어 등은 기존 multilingual_v2. v3 실패 시 v2 구간 분리로 폴백.
        audio_bytes, speed_provider = await _elevenlabs_primary(
            text, voice_id=voice_id, gender=gender, speed=speed, cloned=cloned,
        )
        provider = "elevenlabs"
        logger.info(
            "ElevenLabs TTS 합성 성공: chars=%d, voice_id=%s, gender=%s, speed=%s, "
            "cloned=%s, path=%s",
            len(text), voice_id or "<default>", gender or "<default>", speed or 1.0,
            cloned, speed_provider,
        )
    except Exception as exc:
        # ElevenLabsError 뿐 아니라 httpx.ConnectError 등 변환 안 된 네트워크 예외도
        # Google 폴백으로 흘려보낸다. (과거엔 ElevenLabsError 만 잡아, 연결오류가
        # 그대로 새어 호출부에서 핸들링 안 된 500 — 미리듣기에서 CORS 없는 500 →
        # 브라우저 "연결 불가" — 의 원인이 됐다.)
        fallback_reason = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "ElevenLabs 합성 실패 → Google TTS 폴백 트리거: %s", fallback_reason,
        )
        try:
            audio_bytes = await _run_google_tts(text, speed=speed)
            provider = "google_tts"
            speed_provider = "google_tts"
            logger.info(
                "Google TTS 폴백 합성 성공: chars=%d, original_failure=%s",
                len(text), fallback_reason,
            )
        except Exception as g_exc:
            # Google 도 어떤 이유로든 실패하면 단일 TTSError 로 통합 — synthesize 는
            # TTSError 외 예외를 절대 밖으로 흘리지 않는다(호출부 핸들링 단순화).
            logger.error(
                "TTS 양쪽 provider 모두 실패: elevenlabs=%s, google=%s",
                fallback_reason, g_exc,
            )
            raise TTSError(
                f"TTS 폴백도 실패: elevenlabs={fallback_reason}; google={g_exc}"
            ) from g_exc
    elapsed = time.monotonic() - start

    # ── 발화 속도 후처리 (ffmpeg atempo) ──────────────────────────────────
    # provider 가 네이티브로 적용하지 못한 속도를 ffmpeg 로 추가 가속/감속한다.
    # multilingual_v2 는 0.7~1.2 네이티브, Google 은 speaking_rate, eleven_v3 는
    # speed 미지원이라 네이티브 1.0 → 전량 atempo 로 적용(speed_provider 로 구분).
    audio_bytes = await _postprocess_speed(audio_bytes, speed, speed_provider)

    # ── 자막 정밀 싱크 cue (선택) ─────────────────────────────────────────
    # 속도 후처리까지 끝난 "최종 음원"에 대해 정렬하므로 시각이 재생 타임라인과
    # 정확히 일치한다(atempo·구간 이어붙임·provider 무관). best-effort — 실패해도
    # None 으로 degrade 하고 렌더/합성은 막지 않는다.
    subtitle_cues: list[dict] | None = None
    if with_alignment and settings.SUBTITLE_ALIGNMENT_ENABLED:
        subtitle_cues = await _build_subtitle_cues(audio_bytes, text)

    result = TTSResult(
        audio_bytes=audio_bytes,
        provider=provider,
        duration_seconds=elapsed,
        text_chars=len(text),
        fallback_reason=fallback_reason,
        subtitle_cues=subtitle_cues,
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


# ── ElevenLabs 1차 합성 (전체 v3 / 실패 시 multilingual_v2 폴백) ──────────────
# 사이트의 모든 음성을 eleven_v3 로 합성한다(사용자 정책). v3 는 한 번의 합성으로
# 문장 안 한·중 언어 전환(code-switching)까지 처리하므로 구간 분리·이어붙임이
# 불필요하고 한국어·중국어 모두 자연스럽다. v3 미지원 항목(speed, use_speaker_boost)은
# voice_settings 에 넣지 않고, 속도는 합성 후 atempo 로 적용한다.
_V3_MAX_CHARS = 5000  # eleven_v3 단일 요청 글자 한도


def _is_v3_model(model_id: str | None) -> bool:
    """모델 id 가 eleven_v3 인지(클론 경로의 v3/v2 분기용)."""
    return (model_id or "").strip().lower() == "eleven_v3"


def _v3_voice_settings() -> dict[str, Any]:
    """eleven_v3 용 voice_settings. v3 는 stability(Creative0.0/Natural0.5/
    Robust1.0) 만 의미가 있다(나머지 키는 elevenlabs_client 에서 정리됨). 속도는
    API 미지원이라 atempo 로 처리한다. Natural(0.5)로 합성한다."""
    return {"stability": 0.5}


def _clone_voice_settings() -> dict[str, Any]:
    """클론(IVC) 음성 합성용 voice_settings (multilingual_v2). similarity_boost 를
    높여(기본 0.85) 원본 목소리 재현을 강화하고, stability 0.45 로 약간의 표현력을
    남긴다. 모두 ``settings.ELEVENLABS_CLONE_*`` 로 운영 튜닝 가능."""
    return {
        "stability": settings.ELEVENLABS_CLONE_STABILITY,
        "similarity_boost": settings.ELEVENLABS_CLONE_SIMILARITY_BOOST,
        "style": settings.ELEVENLABS_CLONE_STYLE,
        "use_speaker_boost": settings.ELEVENLABS_CLONE_USE_SPEAKER_BOOST,
    }


async def _elevenlabs_primary(
    text: str,
    *,
    voice_id: str | None,
    gender: str | None,
    speed: float | None,
    cloned: bool = False,
) -> tuple[bytes, str]:
    """ElevenLabs 1차 합성. 반환 ``(audio_bytes, speed_provider)``.

    - **클론(IVC) 음성(cloned=True)**: v3 를 건너뛰고 ``ELEVENLABS_MODEL_ID_CLONE``
      (multilingual_v2)+클론 튜닝 세팅으로 합성한다. v3 는 similarity_boost 등
      클론 튜닝 키를 무시해 본인 목소리 재현이 약해지기 때문. multilingual_v2 는
      네이티브 speed(0.7~1.2)도 지원하므로 ``speed_provider="elevenlabs"``.
    - **일반 음성**: ``ELEVENLABS_MODEL_ID_ZH``(eleven_v3) 단일 호출로 합성한다
      (사이트 전체 v3 정책 — 한·중 코드스위칭 한 번에 처리). speed 는 안 보내고
      atempo 로 처리하므로 ``speed_provider="elevenlabs_v3"``.
    - v3 호출 실패 시 multilingual_v2 경로로 폴백한다(중국어 섞인 텍스트는 구간
      분리로 발음 보존 — 회귀 방지). ``speed_provider="elevenlabs"``.
    - ``ELEVENLABS_MODEL_ID_ZH`` 가 비었거나 5000자 초과면 v2 경로를 쓴다.
    """
    # ── 클론(IVC) 전용 경로 ───────────────────────────────────────────────────
    # 1순위: ELEVENLABS_MODEL_ID_CLONE 이 v3 면 v3 단일 호출(코드스위칭·자연스러운
    #         운율). v3 는 speed 미지원이라 atempo 로 처리 → speed_provider="elevenlabs_v3".
    # 2순위(폴백): multilingual_v2 + 클론 튜닝 세팅(원본 목소리 닮음 우선) + 언어
    #         구간 분리. v3 실패 시 또는 CLONE 모델이 v2 일 때.
    if cloned:
        clone_model = (
            settings.ELEVENLABS_MODEL_ID_CLONE or settings.ELEVENLABS_MODEL_ID
        ).strip()
        if _is_v3_model(clone_model) and len(text) <= _V3_MAX_CHARS:
            try:
                audio = await elevenlabs_client.synthesize(
                    text,
                    voice_id=voice_id,
                    gender=gender,
                    model_id=clone_model,
                    voice_settings=_v3_voice_settings(),
                )
                logger.info(
                    "클론(IVC) v3 합성 성공: model=%s, chars=%d", clone_model, len(text),
                )
                return audio, "elevenlabs_v3"
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "클론 v3 합성 실패 → multilingual_v2(+클론 튜닝) 폴백: %s", exc,
                )
        v2_model = (settings.ELEVENLABS_MODEL_ID or "eleven_multilingual_v2").strip()
        clone_settings = _clone_voice_settings()
        logger.info(
            "클론(IVC) v2 합성: model=%s, similarity_boost=%.2f, stability=%.2f, chars=%d",
            v2_model, clone_settings["similarity_boost"],
            clone_settings["stability"], len(text),
        )
        audio = await _elevenlabs_synthesize_segmented(
            text, voice_id=voice_id, gender=gender, speed=speed,
            model_id=v2_model, voice_settings=clone_settings,
        )
        return audio, "elevenlabs"

    model_v3 = (settings.ELEVENLABS_MODEL_ID_ZH or "").strip()
    if model_v3 and len(text) <= _V3_MAX_CHARS:
        try:
            audio = await elevenlabs_client.synthesize(
                text,
                voice_id=voice_id,
                gender=gender,
                model_id=model_v3,
                voice_settings=_v3_voice_settings(),
            )
            logger.info(
                "ElevenLabs 합성 모델 확정: model=%s, chars=%d", model_v3, len(text),
            )
            return audio, "elevenlabs_v3"
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "eleven_v3 합성 실패 → %s 폴백: %s",
                settings.ELEVENLABS_MODEL_ID, exc,
            )
    audio = await _elevenlabs_synthesize_segmented(
        text, voice_id=voice_id, gender=gender, speed=speed,
    )
    logger.info(
        "ElevenLabs 합성 모델 확정: model=%s (v3 미사용/폴백), chars=%d",
        settings.ELEVENLABS_MODEL_ID, len(text),
    )
    return audio, "elevenlabs"


# ── 언어 구간 분리 합성 (중국어 발음 정확화) ─────────────────────────────────────
# eleven_multilingual_v2 는 합성 요청마다 언어를 하나로 자동 판별한다. 한국어가
# 대부분인 문장에 한자가 섞이면 전체가 한국어로 판정돼 한자가 한국어 한자음
# (我→'아')으로 발음된다. 한자 구간을 떼어 따로 합성하면(격리된 한자 텍스트는
# 중국어로 판별) 같은 voice_id 로도 만다린이 정확히 나온다. 합성 후 ffmpeg 로
# 이어붙인다. 폴백(Google)은 전체 텍스트 단위 유지 — 비상 degrade 경로이며
# (자격증명 미설정 시) 현재 비활성. 중국어 발음 정확성은 1차 ElevenLabs 가 책임.
_SEGMENT_SYNTH_CONCURRENCY = 4


async def _elevenlabs_synthesize_segmented(
    text: str,
    *,
    voice_id: str | None,
    gender: str | None,
    speed: float | None,
    model_id: str | None = None,
    voice_settings: dict[str, Any] | None = None,
) -> bytes:
    """언어 구간별로 ElevenLabs 합성 후 오디오를 이어붙여 반환.

    순수 한국어/중국어(구간 1개) 텍스트는 분리 없이 한 번에 합성한다(기존 동작
    동일). 혼합 텍스트만 구간별로 나눠 합성하고 ``_concat_mp3`` 로 병합한다.
    어느 한 구간이라도 실패하면 예외가 그대로 전파돼 호출부(synthesize)의 Google
    폴백으로 흘러간다.

    model_id/voice_settings: 주어지면 모든 구간 호출에 그대로 전달한다(클론 경로가
    multilingual_v2 + 클론 튜닝 세팅을 강제할 때 사용). None 이면 elevenlabs_client
    기본값(ELEVENLABS_MODEL_ID + 기본 세팅)을 쓴다.
    """
    extra: dict[str, Any] = {}
    if model_id:
        extra["model_id"] = model_id
    if voice_settings is not None:
        extra["voice_settings"] = voice_settings

    segments = split_by_language(text)
    if len(segments) <= 1:
        return await elevenlabs_client.synthesize(
            text, voice_id=voice_id, gender=gender, speed=speed, **extra,
        )

    zh_count = sum(1 for lang, _ in segments if lang == "zh")
    logger.info(
        "혼합 언어 스크립트 구간 분리 합성: 총 %d구간(중국어 %d) — 구간별 합성 후 병합",
        len(segments), zh_count,
    )

    sem = asyncio.Semaphore(_SEGMENT_SYNTH_CONCURRENCY)

    async def _one(chunk: str) -> bytes:
        async with sem:
            return await elevenlabs_client.synthesize(
                chunk, voice_id=voice_id, gender=gender, speed=speed, **extra,
            )

    # gather 는 입력 순서를 보존하므로 구간 순서대로 이어붙일 수 있다.
    parts = await asyncio.gather(*(_one(chunk) for _, chunk in segments))
    return await asyncio.to_thread(_concat_mp3, list(parts))


def _concat_mp3(parts: list[bytes]) -> bytes:
    """여러 mp3 조각을 하나로 이어붙여 반환 (동기 — to_thread 로 오프로드).

    ffmpeg concat demuxer(``-c copy``) 로 무손실 결합한다. ElevenLabs 조각은 모두
    동일 포맷(mp3_44100_128)이라 재인코딩 없이 복사 결합이 안전하다. ffmpeg
    미설치·실패·타임아웃 시 바이트 단순 연결로 폴백한다(대부분 플레이어·HeyGen
    에서 재생 가능 — 크래시보다 graceful degrade).
    """
    parts = [p for p in parts if p]
    if not parts:
        return b""
    if len(parts) == 1:
        return parts[0]

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.warning(
            "ffmpeg 미설치 — mp3 %d개 조각을 바이트 단순 연결로 병합", len(parts),
        )
        return b"".join(parts)

    tmpdir = tempfile.mkdtemp(prefix="tts-concat-")
    try:
        seg_paths: list[Path] = []
        for idx, data in enumerate(parts):
            p = Path(tmpdir) / f"seg_{idx:03d}.mp3"
            p.write_bytes(data)
            seg_paths.append(p)
        list_path = Path(tmpdir) / "list.txt"
        # concat demuxer 포맷: 한 줄에 ``file '<path>'``. 경로는 POSIX 슬래시로.
        list_path.write_text(
            "".join(f"file '{p.as_posix()}'\n" for p in seg_paths),
            encoding="utf-8",
        )
        out_path = Path(tmpdir) / "out.mp3"
        cmd = [
            ffmpeg, "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0",
            "-i", str(list_path),
            "-c", "copy",
            str(out_path),
        ]
        proc = subprocess.run(
            cmd, capture_output=True, timeout=_FFMPEG_TIMEOUT_SEC, check=False,
        )
        if proc.returncode != 0 or not out_path.exists():
            logger.warning(
                "ffmpeg concat 실패(rc=%s) — 바이트 단순 연결로 폴백: %s",
                proc.returncode, proc.stderr[-500:],
            )
            return b"".join(parts)
        return out_path.read_bytes()
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("ffmpeg concat 예외 — 바이트 단순 연결로 폴백: %s", exc)
        return b"".join(parts)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ── 발화 속도 후처리 ────────────────────────────────────────────────────────────
# ElevenLabs voice_settings.speed 가 네이티브로 적용 가능한 범위(0.7~1.2). 그 밖의
# 배율은 합성 음원을 ffmpeg(atempo)로 시간축 가속/감속해 맞춘다.
_ELEVENLABS_NATIVE_SPEED = (0.7, 1.2)
_GOOGLE_NATIVE_SPEED = (0.25, 4.0)
_FFMPEG_TIMEOUT_SEC = 60


def _provider_native_speed(target: float, provider: str) -> float:
    """provider 가 합성 단계에서 실제 적용한 속도 배율(클램프 반영)."""
    if provider == "elevenlabs":
        lo, hi = _ELEVENLABS_NATIVE_SPEED
    elif provider == "elevenlabs_v3":
        # eleven_v3 는 speed 를 안 보내므로 네이티브 적용분이 없다(1.0) → 목표 배율
        # 전체를 ffmpeg atempo 로 적용한다.
        return 1.0
    elif provider == "google_tts":
        lo, hi = _GOOGLE_NATIVE_SPEED
    else:
        return target
    return min(hi, max(lo, target))


def _atempo_chain(factor: float) -> str:
    """ffmpeg atempo 필터 문자열. 단일 atempo 는 0.5~2.0 만 지원하므로 범위 밖은
    곱으로 분해해 체이닝한다(현 사용 범위 0.71~1.67 은 단일로 충분)."""
    parts: list[float] = []
    f = factor
    while f > 2.0:
        parts.append(2.0)
        f /= 2.0
    while f < 0.5:
        parts.append(0.5)
        f /= 0.5
    parts.append(round(f, 4))
    return ",".join(f"atempo={p}" for p in parts)


def _apply_atempo(audio_bytes: bytes, factor: float) -> bytes:
    """mp3 bytes 를 ffmpeg atempo 로 factor 배 시간축 변환해 반환.

    ffmpeg 미설치·실패·타임아웃 시 원본 bytes 를 그대로 반환한다(속도는 provider
    네이티브에 머무름 — 크래시보다 graceful degrade). 동기 함수이므로 호출부에서
    ``asyncio.to_thread`` 로 오프로드한다.
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.warning(
            "ffmpeg 미설치 — 발화 속도 후처리(%.3f×) 생략, provider 네이티브 속도 유지",
            factor,
        )
        return audio_bytes
    in_path = out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as fin:
            fin.write(audio_bytes)
            in_path = fin.name
        out_path = in_path + ".out.mp3"
        cmd = [
            ffmpeg, "-y", "-loglevel", "error",
            "-i", in_path,
            "-filter:a", _atempo_chain(factor),
            "-f", "mp3", out_path,
        ]
        proc = subprocess.run(
            cmd, capture_output=True, timeout=_FFMPEG_TIMEOUT_SEC, check=False,
        )
        if proc.returncode != 0:
            logger.warning(
                "ffmpeg atempo 실패(rc=%s) — 원본 오디오 유지: %s",
                proc.returncode, proc.stderr[-500:],
            )
            return audio_bytes
        return Path(out_path).read_bytes()
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.warning("ffmpeg atempo 예외 — 원본 오디오 유지: %s", exc)
        return audio_bytes
    finally:
        for p in (in_path, out_path):
            if p:
                try:
                    Path(p).unlink(missing_ok=True)
                except OSError:
                    pass


async def _postprocess_speed(
    audio_bytes: bytes, speed: float | None, provider: str
) -> bytes:
    """합성된 mp3 를 목표 배율에 맞춰 ffmpeg 로 후처리(필요할 때만)."""
    if speed is None:
        return audio_bytes
    try:
        target = float(speed)
    except (TypeError, ValueError):
        return audio_bytes
    native = _provider_native_speed(target, provider)
    if native <= 0:
        return audio_bytes
    residual = target / native
    # provider 가 이미 목표 속도를 적용했으면(잔여≈1) 후처리 생략.
    if 0.995 <= residual <= 1.005:
        return audio_bytes
    logger.info(
        "발화 속도 후처리: target=%.3f×, provider_native=%.3f×, ffmpeg_atempo=%.3f×",
        target, native, residual,
    )
    return await asyncio.to_thread(_apply_atempo, audio_bytes, residual)


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


# ── 자막 정밀 싱크 cue 생성 ──────────────────────────────────────────────────────
# Forced Alignment(글자별 시각)을 문장 단위 cue 로 묶는다. 플레이어 KaraokeCaption
# 의 문장 분할 규칙과 동일한 종결부호 기준으로 끊어, 같은 문장이 같은 cue 가 되게 한다.
_SENTENCE_END_CHARS = "。．.!?！？\n"


async def _build_subtitle_cues(audio_bytes: bytes, text: str) -> list[dict] | None:
    """최종 음원 + transcript → 문장 단위 자막 cue. 실패 시 None(폴백)."""
    try:
        alignment = await elevenlabs_client.align_forced(audio_bytes, text)
    except Exception as exc:  # noqa: BLE001 — 자막은 폴백 가능, 렌더를 막지 않는다.
        logger.warning("Forced Alignment 실패 → 자막 cue 생략(글자수 폴백): %s", exc)
        return None
    cues = _cues_from_alignment(alignment)
    if cues:
        logger.info("자막 cue 생성: %d문장 (정밀 싱크)", len(cues))
    else:
        logger.warning("Forced Alignment 응답에서 cue 를 만들지 못함 → 글자수 폴백")
    return cues or None


def _cues_from_alignment(alignment: dict) -> list[dict]:
    """alignment.characters([{text,start,end}, ...]) 를 문장 cue 로 묶는다.

    종결부호(。．.!?！？·개행)에서 한 cue 를 끊는다. 빈/공백 cue 는 버린다.
    각 cue: ``{"start","end","text"}`` — start/end 는 음원 자체 타임라인(초).
    """
    chars = alignment.get("characters") if isinstance(alignment, dict) else None
    if not isinstance(chars, list) or not chars:
        return []
    cues: list[dict] = []
    buf: list[str] = []
    cue_start: float | None = None
    last_end: float = 0.0
    for ch in chars:
        if not isinstance(ch, dict):
            continue
        c = ch.get("text")
        if not isinstance(c, str) or c == "":
            continue
        try:
            cs = float(ch.get("start"))
            ce = float(ch.get("end"))
        except (TypeError, ValueError):
            continue
        # 선행 공백은 cue 시작 시각에 포함하지 않는다.
        if cue_start is None and c.strip():
            cue_start = cs
        buf.append(c)
        last_end = max(last_end, ce)
        if c in _SENTENCE_END_CHARS:
            _flush_cue(cues, buf, cue_start, last_end)
            buf = []
            cue_start = None
    _flush_cue(cues, buf, cue_start, last_end)
    return cues


def _flush_cue(
    cues: list[dict], buf: list[str], start: float | None, end: float
) -> None:
    """버퍼를 cue 로 닫아 cues 에 추가(빈 텍스트·시작시각 없음은 건너뜀)."""
    text = "".join(buf).strip()
    if not text or start is None:
        return
    end = max(float(end), float(start))
    cues.append(
        {"start": round(float(start), 3), "end": round(end, 3), "text": text}
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
