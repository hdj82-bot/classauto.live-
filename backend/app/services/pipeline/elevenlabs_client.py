"""ElevenLabs HTTP 클라이언트.

음성 합성(Text-to-Speech) + Instant Voice Cloning(IVC) 호출을 캡슐화한다.
401 / 429 / 5xx 를 명시 도메인 예외로 변환해 호출부(tts.py 폴백 분기) 가
응답 코드 분석을 다시 하지 않아도 되도록 한다.

- 재시도 정책: ``app.core.retry.retry_external`` 적용 (3회 · exp backoff)
- 4xx (401/403 등 영구 오류) 는 즉시 raise — 폴백 판단은 호출부 책임
- 5xx / 429 / Timeout 은 재시도 후 한도 초과 시 ServerError/QuotaError 로 분류
"""
from __future__ import annotations

import json as _json
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import (
    DEFAULT_MAX_ATTEMPTS,
    RetryableHTTPError,
    retry_external,
)

logger = logging.getLogger(__name__)

# ── 상수 ─────────────────────────────────────────────────────────────────────

_BASE_URL = "https://api.elevenlabs.io/v1"
_DEFAULT_TIMEOUT = 120.0  # 합성은 긴 문장에서 수십 초 소요 — 통상 30s 보다 길게

# eleven_v3 는 voice_settings 모델이 v2 와 다르다. stability 는 Creative(0.0)/
# Natural(0.5)/Robust(1.0) 세 단계만 의미가 있고 similarity_boost·style·
# use_speaker_boost·speed 는 무시/거부될 수 있다(speed 는 audio tag 로 제어).
# 잘못된 키를 실어 보내면 422 로 거부돼 조용히 v2 폴백이 일어날 수 있으므로
# v3 요청 전 voice_settings 를 정리한다.
# 근거: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
_V3_STABILITY_STEPS = (0.0, 0.5, 1.0)


def _is_v3_model(model_id: str) -> bool:
    return (model_id or "").strip().lower() == "eleven_v3"


def _quantize_v3_stability(value: Any) -> float:
    """v3 stability 를 가장 가까운 Creative/Natural/Robust 단계로 스냅."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    return min(_V3_STABILITY_STEPS, key=lambda s: abs(s - v))


def _sanitize_voice_settings(model_id: str, vs: dict[str, Any]) -> dict[str, Any]:
    """모델이 실제로 지원하는 voice_settings 만 남긴다.

    v3 는 stability(이산 3단계) 만 남기고 나머지(similarity_boost·style·
    use_speaker_boost·speed)는 제거한다. v2 등은 그대로 통과시킨다.
    """
    if not _is_v3_model(model_id):
        return vs
    out: dict[str, Any] = {}
    if "stability" in vs:
        out["stability"] = _quantize_v3_stability(vs["stability"])
    return out


# ── 도메인 예외 ──────────────────────────────────────────────────────────────


class ElevenLabsError(Exception):
    """ElevenLabs API 호출 실패 (기반 클래스)."""


class ElevenLabsAuthError(ElevenLabsError):
    """401: 인증 실패 (잘못된/만료된 API 키)."""


class ElevenLabsQuotaError(ElevenLabsError):
    """429: 쿼터/레이트 리밋 — 재시도 후에도 해소되지 않으면 폴백 권고."""


class ElevenLabsServerError(ElevenLabsError):
    """5xx / 네트워크 타임아웃 — 재시도 후에도 실패 시 폴백 권고."""


# ── 합성 (TTS) ───────────────────────────────────────────────────────────────


def pick_voice_id(gender: str | None = None) -> str:
    """강의 성별 → ELEVENLABS_VOICE_ID_{MALE,FEMALE} 환경변수 매핑.

    gender 가 ``"male"`` | ``"female"`` 이면 해당 ID, 비거나 None 이면 MALE 을 기본.
    _MALE/_FEMALE 가 비어 있으면 deprecated ``ELEVENLABS_VOICE_ID`` 로 fallback —
    1단계 단일 ID 운영 환경에서도 호출이 깨지지 않도록.
    VoiceGender enum 도 .value 를 통해 str 로 비교되므로 그대로 받을 수 있다.
    """
    g = (str(gender) if gender is not None else "male").strip().lower()
    if g == "female":
        primary = settings.ELEVENLABS_VOICE_ID_FEMALE
    else:
        primary = settings.ELEVENLABS_VOICE_ID_MALE
    vid = (primary or settings.ELEVENLABS_VOICE_ID or "").strip()
    return vid


def _voice_id_or_default(voice_id: str | None, gender: str | None = None) -> str:
    """호출자가 ``voice_id`` 를 명시했으면 그것 우선(IVC cloned voice 등),
    아니면 ``pick_voice_id(gender)`` 결과를 사용한다.
    """
    vid = (voice_id or pick_voice_id(gender) or "").strip()
    if not vid:
        raise ElevenLabsError(
            "ELEVENLABS_VOICE_ID 가 비어있고 voice_id 인자도 전달되지 않음"
        )
    return vid


def _default_voice_settings() -> dict[str, Any]:
    return {
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": True,
    }


def _clamp_speed(speed: float | None) -> float | None:
    """ElevenLabs voice_settings.speed 유효 범위는 0.7~1.2. 범위 밖은 클램프.

    None 이면 그대로 None (속도 미지정 — 기본 1.0).
    """
    if speed is None:
        return None
    try:
        s = float(speed)
    except (TypeError, ValueError):
        return None
    return max(0.7, min(1.2, s))


async def synthesize(
    text: str,
    *,
    voice_id: str | None = None,
    gender: str | None = None,
    speed: float | None = None,
    model_id: str | None = None,
    output_format: str | None = None,
    voice_settings: dict[str, Any] | None = None,
    timeout: float = _DEFAULT_TIMEOUT,
) -> bytes:
    """ElevenLabs TTS 합성. 성공 시 mp3 audio bytes 반환.

    voice_id: 교수자가 고른 보이스 ID. None 이면 ``pick_voice_id(gender)`` 의
              시스템 기본 voice 사용.
    gender:   ``"male"`` | ``"female"`` — voice_id 가 None 일 때 _MALE/_FEMALE 분기 키.
              None 이면 male.
    speed:    발화 속도 배율. 1.0 이 기본. 0.7~1.2 로 클램프해 voice_settings.speed
              에 실어 보낸다. None 이면 속도 키를 넣지 않음(기본 속도).
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    vid = _voice_id_or_default(voice_id, gender)
    mid = (model_id or settings.ELEVENLABS_MODEL_ID).strip()
    fmt = (output_format or settings.ELEVENLABS_OUTPUT_FORMAT or "mp3_44100_128").strip()
    payload_settings = dict(voice_settings or _default_voice_settings())
    clamped_speed = _clamp_speed(speed)
    if clamped_speed is not None and clamped_speed != 1.0:
        payload_settings["speed"] = clamped_speed
    # 모델별 미지원 키 제거(특히 v3) — 422 거부로 인한 조용한 폴백 방지.
    payload_settings = _sanitize_voice_settings(mid, payload_settings)

    try:
        return await _synthesize_with_retry(
            text=text,
            voice_id=vid,
            model_id=mid,
            output_format=fmt,
            voice_settings=payload_settings,
            timeout=timeout,
        )
    except (RetryableHTTPError, httpx.HTTPStatusError, httpx.TimeoutException) as exc:
        # 재시도 한도까지 5xx/429/timeout 였다면 도메인 예외로 분류해 호출부 폴백 단순화
        status = _status_from_exc(exc)
        if status == 429:
            raise ElevenLabsQuotaError(
                f"ElevenLabs 쿼터/레이트리밋 — 재시도 {DEFAULT_MAX_ATTEMPTS}회 초과"
            ) from exc
        raise ElevenLabsServerError(
            f"ElevenLabs 서버 오류 — 재시도 {DEFAULT_MAX_ATTEMPTS}회 초과: {exc}"
        ) from exc


@track_external_api("elevenlabs")
@retry_external(label="elevenlabs.synthesize")
async def _synthesize_with_retry(
    *,
    text: str,
    voice_id: str,
    model_id: str,
    output_format: str,
    voice_settings: dict[str, Any],
    timeout: float,
) -> bytes:
    url = f"{_BASE_URL}/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {"text": text, "model_id": model_id, "voice_settings": voice_settings}
    params = {"output_format": output_format}
    logger.info(
        "ElevenLabs TTS 요청: voice_id=%s, model=%s, format=%s, chars=%d, settings=%s",
        voice_id, model_id, output_format, len(text), voice_settings,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload, params=params)
    audio = _interpret_synth_response(resp)
    # 실제 합성에 사용된 model 을 200 응답 직후 명시 로깅한다(추측 제거 — 호출부
    # 폴백 분기와 합쳐 "어떤 model 로 합성됐는지"가 로그만으로 확정되도록).
    logger.info(
        "ElevenLabs TTS 합성 성공: voice_id=%s, model=%s, format=%s, bytes=%d",
        voice_id, model_id, output_format, len(audio),
    )
    return audio


def _interpret_synth_response(resp: httpx.Response) -> bytes:
    """200 → bytes 반환, 4xx/5xx → 분류해 raise (재시도 데코와 합치)."""
    if resp.status_code == 200:
        return resp.content
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs 401: {resp.text[:300]}")
    if resp.status_code in (429, 500, 502, 503, 504):
        # retry_external 데코레이터가 재시도하도록 httpx.HTTPStatusError 로 띄움
        raise httpx.HTTPStatusError(
            f"ElevenLabs HTTP {resp.status_code}",
            request=resp.request,
            response=resp,
        )
    if 400 <= resp.status_code < 500:
        raise ElevenLabsError(
            f"ElevenLabs HTTP {resp.status_code}: {resp.text[:300]}"
        )
    raise ElevenLabsServerError(
        f"ElevenLabs HTTP {resp.status_code}: {resp.text[:300]}"
    )


def _status_from_exc(exc: BaseException) -> int | None:
    if isinstance(exc, RetryableHTTPError):
        return exc.status_code
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code
    return None


# ── 보이스 목록 (선택 UI) ─────────────────────────────────────────────────────


async def list_voices(
    timeout: float = 30.0, *, show_legacy: bool = False
) -> list[dict[str, Any]]:
    """ElevenLabs 보이스 목록 조회 (``GET /v1/voices``).

    교수자 음성 선택 UI 용. 각 항목의 raw dict (voice_id / name / labels /
    preview_url / category / description) 를 그대로 반환하고, 호출부에서
    필요한 필드만 추려 응답 스키마로 변환한다. 합성 hot-path 가 아니라
    재시도 데코는 생략 — 실패 시 도메인 예외를 던지고 호출부가 빈 목록으로
    degrade 한다.
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    url = f"{_BASE_URL}/voices"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Accept": "application/json",
    }
    # show_legacy=true 면 레거시 premade 보이스까지 포함해 더 많은 기본 보이스를
    # 노출한다(교수자 음성 선택 폭 확대). 공유 라이브러리(shared-voices)는 제외.
    params = {"show_legacy": "true"} if show_legacy else None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers, params=params)
    except httpx.TimeoutException as exc:
        raise ElevenLabsServerError(f"ElevenLabs 보이스 목록 타임아웃: {exc}") from exc

    if resp.status_code == 200:
        data = resp.json()
        voices = data.get("voices") if isinstance(data, dict) else None
        return voices if isinstance(voices, list) else []
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs voices 401: {resp.text[:300]}")
    raise ElevenLabsServerError(
        f"ElevenLabs voices HTTP {resp.status_code}: {resp.text[:300]}"
    )


async def get_voice(voice_id: str, timeout: float = 30.0) -> dict[str, Any]:
    """단일 보이스 메타 조회 (``GET /v1/voices/{voice_id}``).

    큐레이션 목록의 보이스가 계정 ``GET /v1/voices`` 응답에 안 잡힐 때(premade
    보이스가 계정 라이브러리에 미등록인 경우 등) 개별 조회용. 반환 dict 의 shape
    는 ``list_voices`` 항목과 동일하다. 합성 hot-path 가 아니므로 재시도 데코는
    생략하고, 실패 시 도메인 예외를 던져 호출부가 해당 보이스를 스킵하게 한다.
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    url = f"{_BASE_URL}/voices/{voice_id}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
    except httpx.TimeoutException as exc:
        raise ElevenLabsServerError(f"ElevenLabs voice {voice_id} 타임아웃: {exc}") from exc

    if resp.status_code == 200:
        data = resp.json()
        return data if isinstance(data, dict) else {}
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs voice {voice_id} 401: {resp.text[:200]}")
    raise ElevenLabsServerError(
        f"ElevenLabs voice {voice_id} HTTP {resp.status_code}: {resp.text[:200]}"
    )


# ── 공유 보이스 라이브러리 (Shared Voice Library) ────────────────────────────


async def list_shared_voices(
    *,
    page: int = 0,
    page_size: int = 30,
    search: str | None = None,
    gender: str | None = None,
    language: str | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """공유 보이스 라이브러리 조회 (``GET /v1/shared-voices``).

    수천 개 커뮤니티 보이스를 검색·필터·페이지네이션으로 가져온다. 반환:
    ``{"voices": [...raw...], "has_more": bool}``. raw 항목엔 public_owner_id /
    voice_id / name / description / preview_url / gender / accent / language /
    use_case 등이 있고, 필드 누락은 호출부가 ``.get`` 으로 방어한다. 키 미설정·
    장애 시 도메인 예외 → 호출부가 빈 목록으로 degrade.
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    url = f"{_BASE_URL}/shared-voices"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY, "Accept": "application/json"}
    params: dict[str, Any] = {
        "page_size": max(1, min(100, page_size)),
        "page": max(0, page),
    }
    if search:
        params["search"] = search
    if gender:
        params["gender"] = gender
    if language:
        params["language"] = language
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers, params=params)
    except httpx.TimeoutException as exc:
        raise ElevenLabsServerError(f"ElevenLabs shared-voices 타임아웃: {exc}") from exc

    if resp.status_code == 200:
        data = resp.json()
        if not isinstance(data, dict):
            return {"voices": [], "has_more": False}
        voices = data.get("voices")
        return {
            "voices": voices if isinstance(voices, list) else [],
            "has_more": bool(data.get("has_more", False)),
        }
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs shared-voices 401: {resp.text[:200]}")
    raise ElevenLabsServerError(
        f"ElevenLabs shared-voices HTTP {resp.status_code}: {resp.text[:200]}"
    )


async def add_shared_voice(
    public_owner_id: str,
    voice_id: str,
    new_name: str,
    timeout: float = 30.0,
) -> str:
    """공유 라이브러리 보이스를 내 계정에 추가
    (``POST /v1/voices/add/{public_owner_id}/{voice_id}``).

    추가되면 새 account voice_id 를 받아 GET /v1/voices 에 노출되고 합성/렌더에
    쓸 수 있다. 반환: 새 voice_id. 요금제 보이스 한도 초과 등은 ElevenLabsError
    로 변환해 호출부가 사용자 메시지로 처리하게 한다.
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    url = f"{_BASE_URL}/voices/add/{public_owner_id}/{voice_id}"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json={"new_name": new_name})
    except httpx.TimeoutException as exc:
        raise ElevenLabsServerError(f"ElevenLabs add voice 타임아웃: {exc}") from exc

    if resp.status_code in (200, 201):
        data = resp.json()
        vid = data.get("voice_id") if isinstance(data, dict) else None
        if not vid:
            raise ElevenLabsServerError("ElevenLabs add voice: 응답에 voice_id 누락")
        return vid
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs add voice 401: {resp.text[:200]}")
    raise ElevenLabsError(
        f"ElevenLabs add voice HTTP {resp.status_code}: {resp.text[:300]}"
    )


# ── Instant Voice Cloning (IVC) ──────────────────────────────────────────────


async def clone_voice(
    name: str,
    audio_files: list[tuple[str, bytes]],
    *,
    description: str | None = None,
    labels: dict[str, str] | None = None,
    remove_background_noise: bool | None = None,
    timeout: float = _DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """ElevenLabs Instant Voice Cloning 으로 cloned voice 생성.

    - audio_files: ``[(filename, bytes), ...]`` — 30초~수분 분량 샘플
    - remove_background_noise: 샘플의 배경 잡음 제거(마이크 녹음 보정 → 클론
      fidelity↑). None 이면 ``settings.ELEVENLABS_IVC_REMOVE_NOISE`` 를 따른다.
    - 반환: ``{"voice_id": "...", ...}`` (생성된 voice 메타데이터)

    ``custom_voices`` 테이블 INSERT 시 ``elevenlabs_voice_id`` 로 사용한다.
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    if not audio_files:
        raise ElevenLabsError("clone_voice: 음성 샘플이 비어있음")

    denoise = (
        settings.ELEVENLABS_IVC_REMOVE_NOISE
        if remove_background_noise is None
        else remove_background_noise
    )
    try:
        return await _clone_voice_with_retry(
            name=name,
            audio_files=audio_files,
            description=description,
            labels=labels,
            remove_background_noise=denoise,
            timeout=timeout,
        )
    except (RetryableHTTPError, httpx.HTTPStatusError, httpx.TimeoutException) as exc:
        status = _status_from_exc(exc)
        if status == 429:
            raise ElevenLabsQuotaError(
                f"ElevenLabs IVC 쿼터/레이트리밋 — 재시도 {DEFAULT_MAX_ATTEMPTS}회 초과"
            ) from exc
        raise ElevenLabsServerError(
            f"ElevenLabs IVC 서버 오류 — 재시도 {DEFAULT_MAX_ATTEMPTS}회 초과: {exc}"
        ) from exc


@track_external_api("elevenlabs")
@retry_external(label="elevenlabs.clone_voice")
async def _clone_voice_with_retry(
    *,
    name: str,
    audio_files: list[tuple[str, bytes]],
    description: str | None,
    labels: dict[str, str] | None,
    remove_background_noise: bool = False,
    timeout: float,
) -> dict[str, Any]:
    url = f"{_BASE_URL}/voices/add"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    files = [
        ("files", (fname, data, "audio/mpeg")) for fname, data in audio_files
    ]
    data: dict[str, Any] = {"name": name}
    if description:
        data["description"] = description
    if labels:
        data["labels"] = _json.dumps(labels)
    # multipart form 의 bool 은 소문자 문자열로 보낸다(ElevenLabs add-voice 규약).
    data["remove_background_noise"] = "true" if remove_background_noise else "false"
    logger.info(
        "ElevenLabs IVC 요청: name=%s, samples=%d, remove_noise=%s",
        name, len(audio_files), remove_background_noise,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, data=data, files=files)
    return _interpret_clone_response(resp)


async def delete_voice(voice_id: str, timeout: float = 30.0) -> None:
    """cloned voice 삭제 (``DELETE /v1/voices/{voice_id}``).

    본인 음성 교체/삭제 시 이전 voice 정리에 쓴다. 합성 hot-path 가 아니므로
    재시도 데코는 생략하고, 실패 시 도메인 예외를 던져 호출부가 best-effort 로
    삼키게 한다(이미 삭제됐거나 없는 voice 의 404 도 예외로 올라온다).
    """
    if not (settings.ELEVENLABS_API_KEY or "").strip():
        raise ElevenLabsAuthError("ELEVENLABS_API_KEY 미설정")
    if not (voice_id or "").strip():
        raise ElevenLabsError("delete_voice: voice_id 가 비어있음")
    url = f"{_BASE_URL}/voices/{voice_id}"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.delete(url, headers=headers)
    except httpx.TimeoutException as exc:
        raise ElevenLabsServerError(f"ElevenLabs voice 삭제 타임아웃: {exc}") from exc

    if resp.status_code == 200:
        return
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs voice 삭제 401: {resp.text[:200]}")
    raise ElevenLabsError(
        f"ElevenLabs voice 삭제 HTTP {resp.status_code}: {resp.text[:200]}"
    )


def _interpret_clone_response(resp: httpx.Response) -> dict[str, Any]:
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code == 401:
        raise ElevenLabsAuthError(f"ElevenLabs IVC 401: {resp.text[:300]}")
    if resp.status_code in (429, 500, 502, 503, 504):
        raise httpx.HTTPStatusError(
            f"ElevenLabs IVC HTTP {resp.status_code}",
            request=resp.request,
            response=resp,
        )
    if 400 <= resp.status_code < 500:
        raise ElevenLabsError(
            f"ElevenLabs IVC HTTP {resp.status_code}: {resp.text[:300]}"
        )
    raise ElevenLabsServerError(
        f"ElevenLabs IVC HTTP {resp.status_code}: {resp.text[:300]}"
    )
