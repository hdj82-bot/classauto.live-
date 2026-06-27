"""TTS 파이프라인 (ElevenLabs eleven_v3 전용 — 폴백 없음).

orchestrator. 실 HTTP 호출은 ``elevenlabs_client`` 가 담당하며, 이 모듈은 다음
책임만 갖는다.

정책(2026-06-16 교수자): 모든 음성(교수자 본인 음성·AI 아바타 음성)은 ElevenLabs
eleven_v3 로만 합성한다.
- v2(eleven_multilingual_v2)·언어 구간분리 합성으로의 폴백을 두지 않는다.
- Google TTS 등 ElevenLabs 가 아닌 다른 서비스로의 폴백도 두지 않는다.
- 합성 실패는 다른 경로로 우회하지 않고 ``TTSError`` 로 그대로 올려(원인이 로그·응답에
  드러나게) 렌더를 멈춘다 — v3 가 아닌 음성을 절대 내보내지 않기 위함.

책임:
1. ElevenLabs eleven_v3 합성(settings.ELEVENLABS_MODEL_ID_ZH / 클론은 _CLONE).
2. 실패 시 ``TTSError`` raise (폴백 없음).
3. 발화 속도 후처리(v3 는 speed 미지원 → ffmpeg atempo).
4. (선택) 자막 정밀 싱크 cue(Forced Alignment).
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
from app.services.pipeline import elevenlabs_client
from app.services.pipeline.text_cleanup import strip_pinyin_annotations

if TYPE_CHECKING:
    import uuid

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """TTS 합성 실패 (ElevenLabs 와 Google 모두 실패)."""


class TTSResult:
    """합성 결과.

    audio_bytes: mp3 audio
    provider: "elevenlabs" (eleven_v3 전용 — 폴백 없음)
    duration_seconds: 호출+합성에 걸린 wall-clock (오디오 길이 아님)
    text_chars: 입력 텍스트 글자수 (단가 계산 / 회계용)
    fallback_reason: 폴백 정책 제거로 항상 None(회계 스키마 호환 위해 필드만 유지).
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
    # 편집본도 깨끗하게 발화되도록 합성 직전에 한 번 더 제거한다(본 합성·미리듣기
    # 모두 이 경로를 거친다).
    text = strip_pinyin_annotations(text)

    # 폴백을 두지 않으므로 fallback_reason 은 항상 None(회계 스키마 호환 위해 필드만 유지).
    fallback_reason: str | None = None
    speed_provider = "elevenlabs_v3"
    start = time.monotonic()
    try:
        # 모든 음성을 eleven_v3 단일 호출로 합성한다 — 문장 안 한·중 전환(코드스위칭)을
        # 한 음원에서 처리(구간 분리·이어붙임 없음 → 멈춤/끊김·발음 깨짐 제거). 정책상
        # v2·Google 폴백을 두지 않는다.
        audio_bytes, speed_provider = await _elevenlabs_primary(
            text, voice_id=voice_id, gender=gender, speed=speed, cloned=cloned,
        )
        provider = "elevenlabs"
        logger.info(
            "ElevenLabs v3 TTS 합성 성공: chars=%d, voice_id=%s, gender=%s, speed=%s, cloned=%s",
            len(text), voice_id or "<default>", gender or "<default>", speed or 1.0, cloned,
        )
    except TTSError:
        raise  # 이미 통합 예외 — 이중 래핑 방지.
    except Exception as exc:
        # ElevenLabs 실패(인증 401·쿼터 429·5xx·연결오류 등) 또는 v3 미설정. 폴백 금지
        # 정책에 따라 다른 provider(Google)·다른 모델(v2)로 우회하지 않고, 단일 TTSError
        # 로 그대로 올린다 — v3 가 아닌 음성을 절대 내보내지 않는다. 호출부는 렌더 실패로
        # 처리하고, 실패 원인(메시지)이 로그·응답에 그대로 드러난다.
        reason = f"{type(exc).__name__}: {exc}"
        logger.error(
            "ElevenLabs v3 합성 실패 — 폴백 금지 정책으로 렌더 중단(v2/Google 미사용): %s",
            reason,
        )
        raise TTSError(f"ElevenLabs v3 합성 실패: {reason}") from exc
    elapsed = time.monotonic() - start

    # ── 발화 속도 후처리 (ffmpeg atempo) ──────────────────────────────────
    # eleven_v3 는 speed 를 API 로 지원하지 않아 네이티브 적용분이 1.0 → 목표 배율
    # 전량을 ffmpeg atempo 로 적용한다.
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


# ── ElevenLabs eleven_v3 전용 합성 (폴백 없음) ──────────────────────────────────
# 정책(2026-06-16 교수자): 모든 음성(교수자 본인 음성·AI 아바타 음성)을 eleven_v3 로만
# 합성한다. v3 는 한 번의 합성으로 문장 안 한·중 언어 전환(code-switching)까지 처리하므로
# 구간 분리·이어붙임이 불필요하고 한국어·중국어 모두 자연스럽다. v3 미지원 항목(speed,
# use_speaker_boost)은 voice_settings 에 넣지 않고, 속도는 합성 후 atempo 로 적용한다.
# v2(multilingual_v2)·언어 구간분리·Google TTS 등 어떤 폴백도 두지 않는다(실패 시 raise).


def _is_v3_model(model_id: str | None) -> bool:
    """모델 id 가 eleven_v3 인지."""
    return (model_id or "").strip().lower() == "eleven_v3"


def _v3_voice_settings() -> dict[str, Any]:
    """eleven_v3 용 voice_settings. v3 는 stability(Creative0.0/Natural0.5/
    Robust1.0) 만 의미가 있다(나머지 키는 elevenlabs_client 에서 정리됨). 속도는
    API 미지원이라 atempo 로 처리한다. Natural(0.5)로 합성한다."""
    return {"stability": 0.5}


async def _elevenlabs_primary(
    text: str,
    *,
    voice_id: str | None,
    gender: str | None,
    speed: float | None,  # noqa: ARG001 — v3 는 speed 미지원; 합성 후 atempo 로 적용.
    cloned: bool = False,
) -> tuple[bytes, str]:
    """ElevenLabs eleven_v3 단일 호출 합성. 반환 ``(audio_bytes, "elevenlabs_v3")``.

    정책(2026-06-16 교수자): 교수자 본인 음성(클론)·AI 아바타 음성 모두 eleven_v3 로만
    합성한다. v2(multilingual_v2)·언어 구간분리, Google TTS 등 어떤 폴백도 두지 않는다 —
    v3 가 아닌 음성을 내보내지 않기 위함. 합성 실패는 예외로 그대로 올려 호출부
    (synthesize)가 TTSError 로 변환·렌더를 멈춘다.

    speed 는 v3 가 API 로 지원하지 않으므로 보내지 않고, 합성 후 atempo 로 적용한다
    (speed_provider="elevenlabs_v3"). 클론도 v3 의 stability 만 쓰며, similarity_boost
    등 v2 전용 튜닝키는 싣지 않는다(v3 가 무시).
    """
    # 클론은 _CLONE, 일반은 _ZH 모델을 쓴다(둘 다 기본값 eleven_v3).
    model_v3 = (
        settings.ELEVENLABS_MODEL_ID_CLONE if cloned else settings.ELEVENLABS_MODEL_ID_ZH
    ).strip()
    if not _is_v3_model(model_v3):
        # v3 전용 정책인데 설정이 v3 가 아니면 — 폴백으로 우회하지 않고 명확히 실패한다.
        key = "ELEVENLABS_MODEL_ID_CLONE" if cloned else "ELEVENLABS_MODEL_ID_ZH"
        raise TTSError(
            f"음성은 eleven_v3 전용 정책인데 {key}={model_v3!r} 가 v3 가 아닙니다 — "
            f"'{key}=eleven_v3' 로 설정하세요(v2/타 서비스 폴백 금지)."
        )
    audio = await elevenlabs_client.synthesize(
        text,
        voice_id=voice_id,
        gender=gender,
        model_id=model_v3,
        voice_settings=_v3_voice_settings(),
    )
    logger.info(
        "ElevenLabs v3 합성: model=%s, cloned=%s, chars=%d", model_v3, cloned, len(text),
    )
    return audio, "elevenlabs_v3"


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
_FFMPEG_TIMEOUT_SEC = 60


def _provider_native_speed(target: float, provider: str) -> float:
    """provider 가 합성 단계에서 실제 적용한 속도 배율(클램프 반영)."""
    if provider == "elevenlabs_v3":
        # eleven_v3 는 speed 를 안 보내므로 네이티브 적용분이 없다(1.0) → 목표 배율
        # 전체를 ffmpeg atempo 로 적용한다(현재 모든 합성이 v3).
        return 1.0
    if provider == "elevenlabs":
        lo, hi = _ELEVENLABS_NATIVE_SPEED
        return min(hi, max(lo, target))
    return target


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


async def build_subtitle_cues_for_audio(
    audio_bytes: bytes, text: str
) -> list[dict] | None:
    """기존 음원 + transcript 로 자막 정밀 싱크 cue 를 만든다(**재합성 없이**).

    render 태스크가 '음원은 이미 있으나 cue 가 없는' 렌더의 cue 를 백필할 때 쓴다
    — 정렬 기능 도입 전에 만들어진 음원, 또는 '다시 제작'에서 텍스트가 그대로라
    재합성을 건너뛴(=TTS idempotency) 슬라이드가 그 대상이다. Forced Alignment 는
    합성과 별개 단계라, 음원을 다시 만들지 않고 정렬만 돌려 cue 를 채울 수 있다.

    ``SUBTITLE_ALIGNMENT_ENABLED`` 가 꺼져 있거나 입력이 비면 None 을 돌려준다.
    실패는 ``_build_subtitle_cues`` 가 삼켜 None 으로 degrade 한다(렌더를 막지 않음).
    """
    if not settings.SUBTITLE_ALIGNMENT_ENABLED:
        return None
    if not audio_bytes or not (text or "").strip():
        return None
    return await _build_subtitle_cues(audio_bytes, text)


# ── 후방 호환 헬퍼 ───────────────────────────────────────────────────────────
# 기존 caller 와 외부 단위 테스트가 이 이름을 import 한다. ElevenLabs 위임 호출로
# 시그니처와 도메인 예외 변환 동작만 보존한다(Google 위임 헬퍼는 폴백 금지 정책으로 제거).


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
