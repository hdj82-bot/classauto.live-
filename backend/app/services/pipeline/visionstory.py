"""VisionStory (V-Talk) API 클라이언트 — 교수자 본인 얼굴 Q&A·미리보기 렌더.

이전엔 Hedra(사진+음성 per-render)를 썼으나 품질 문제로 VisionStory 로 교체했다.

**모델 차이(중요)**: Hedra 는 렌더마다 이미지를 업로드했지만, VisionStory 는
사진으로 **아바타를 한 번 생성(``avatar_id``)** 한 뒤 그 아바타로 영상을 만든다.
그래서 교수자별 ``avatar_id`` 를 ``users.visionstory_avatar_id`` 에 캐시해 모든
Q&A·미리보기 렌더에서 재사용한다(사진이 바뀌면 호출부가 재생성). 등록 한도가 없어
사용자 수만큼 확장된다(HeyGen Photo Avatar 의 계정당 3개 한도 회피).

렌더 흐름(공개 API ``/api/v1``):
  1. POST /avatar  {inline_data:{mime_type, data(base64)}}        → {avatar_id, ...}
  2. POST /video   {model_id, avatar_id, audio_script:{inline_data,...},
                    aspect_ratio, resolution}                      → {video_id}
  3. GET  /video?video_id=...                                      → {status, video_url}
     status: queued | creating | failed | created("created"=완료)

인증: 헤더 ``X-API-Key: sk-vs-...``. 키가 비어 있으면 VisionStoryError 를 던져
호출부(qa_batch / avatars)가 HeyGen 표준 아바타로 폴백하게 한다(서비스 연속성).
"""
from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import RetryableHTTPError, request_with_retry

logger = logging.getLogger(__name__)


class VisionStoryError(Exception):
    """VisionStory API 호출 실패."""


# ── 비용 추정 ────────────────────────────────────────────────────────────────


def estimate_cost_usd(duration_seconds: float | None) -> float:
    """영상 길이(초) × ``VISIONSTORY_COST_USD_PER_SECOND`` (회계용 근사치).

    VisionStory 는 크레딧 과금이라 정확한 USD 는 응답의 cost_credit 으로 따로 보지만,
    기존 회계 인터페이스(duration 기반)를 유지한다. duration 미상이면 0.
    """
    if duration_seconds is None or duration_seconds <= 0:
        return 0.0
    return round(duration_seconds * settings.VISIONSTORY_COST_USD_PER_SECOND, 6)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────


def _require_key() -> str:
    key = (settings.VISIONSTORY_API_KEY or "").strip()
    if not key:
        raise VisionStoryError(
            "VISIONSTORY_API_KEY 미설정 — 본인 얼굴 렌더 불가(표준 아바타로 폴백)."
        )
    return key


def _headers() -> dict[str, str]:
    return {"X-API-Key": _require_key(), "Content-Type": "application/json"}


@track_external_api("visionstory")
async def _request_json(
    method: str,
    path: str,
    *,
    json: dict | None = None,
    params: dict | None = None,
    timeout: float = 30.0,
) -> httpx.Response:
    """JSON 요청 — heygen.py 와 동일한 재시도 정책 위임(4xx 즉시 반환)."""
    url = f"{settings.VISIONSTORY_BASE_URL}{path}"
    try:
        return await request_with_retry(
            method,
            url,
            headers=_headers(),
            json=json,
            params=params,
            timeout=timeout,
            label=f"visionstory.{method.lower()}",
        )
    except httpx.HTTPStatusError as exc:
        return exc.response
    except (RetryableHTTPError, httpx.TimeoutException) as exc:
        raise VisionStoryError(f"VisionStory API 최대 재시도 초과: {exc}") from exc


def _error_text(resp: httpx.Response) -> str:
    """VisionStory 오류 응답({error:{code,message}})에서 사람이 읽을 메시지 추출."""
    try:
        body = resp.json()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            return f"{err.get('code')}: {err.get('message')}"
    except Exception:  # noqa: BLE001
        pass
    return resp.text[:300]


# ── 아바타 생성 (사진 → avatar_id, 1회) ───────────────────────────────────────


async def create_avatar(image_bytes: bytes, image_ctype: str = "image/jpeg") -> str:
    """본인 사진으로 VisionStory 아바타를 생성하고 ``avatar_id`` 를 반환한다.

    MOCK 이면 외부 호출 0 으로 가짜 avatar_id 를 돌려준다. 생성한 avatar_id 는
    호출부가 User 에 캐시해 재사용한다(매 렌더 재생성 금지).
    """
    if settings.VISIONSTORY_MOCK:
        return "mock-vs-avatar"

    mime = "image/png" if "png" in (image_ctype or "").lower() else "image/jpeg"
    payload = {
        "inline_data": {
            "mime_type": mime,
            "data": base64.b64encode(image_bytes).decode("ascii"),
        }
    }
    resp = await _request_json("POST", "/api/v1/avatar", json=payload, timeout=120.0)
    if resp.status_code >= 400:
        raise VisionStoryError(
            f"VisionStory 아바타 생성 오류 [{resp.status_code}]: {_error_text(resp)}"
        )
    data = (resp.json() or {}).get("data") or {}
    avatar_id = data.get("avatar_id")
    if not avatar_id:
        raise VisionStoryError(f"VisionStory 아바타 응답에 avatar_id 없음: {str(data)[:300]}")
    logger.info("VisionStory 아바타 생성: avatar_id=%s", avatar_id)
    return str(avatar_id)


# ── 렌더 제출 / 상태 폴링 ─────────────────────────────────────────────────────


async def submit_talking_video(
    *,
    avatar_id: str,
    audio_bytes: bytes,
    audio_ctype: str = "audio/mpeg",
    text_prompt: str = "",  # noqa: ARG001 — Hedra 호환 시그니처(VisionStory 미사용)
) -> str:
    """아바타 + 음성 → 말하는 영상 렌더 제출. video_id 반환.

    이미 합성한 음성(ElevenLabs TTS)을 그대로 쓰도록 audio_script.inline_data 로
    넘기고 voice_change=false(보이스 변환 안 함)·denoise=false 로 둔다 — 교수자가
    고른 목소리를 유지한다. MOCK 이면 외부 호출 0 으로 가짜 video_id 를 돌려준다.
    """
    if settings.VISIONSTORY_MOCK:
        return "mock-vs-video"

    mime = (
        "audio/mp3"
        if ("mpeg" in audio_ctype.lower() or "mp3" in audio_ctype.lower())
        else "audio/wav"
    )
    payload = {
        "model_id": settings.VISIONSTORY_MODEL_ID,
        "avatar_id": avatar_id,
        "audio_script": {
            "inline_data": {
                "mime_type": mime,
                "data": base64.b64encode(audio_bytes).decode("ascii"),
            },
            "voice_change": False,
            "denoise": False,
        },
        "aspect_ratio": settings.VISIONSTORY_ASPECT_RATIO,
        "resolution": settings.VISIONSTORY_RESOLUTION,
    }
    resp = await _request_json("POST", "/api/v1/video", json=payload, timeout=60.0)
    if resp.status_code >= 400:
        raise VisionStoryError(
            f"VisionStory 렌더 제출 오류 [{resp.status_code}]: {_error_text(resp)}"
        )
    data = (resp.json() or {}).get("data") or {}
    video_id = data.get("video_id")
    if not video_id:
        raise VisionStoryError(f"VisionStory 렌더 응답에 video_id 없음: {str(data)[:300]}")
    logger.info("VisionStory 렌더 제출: video_id=%s, avatar=%s", video_id, avatar_id)
    return str(video_id)


def _normalize_status(raw: str | None) -> str:
    """VisionStory status → heygen 호환(completed|failed|processing).

    VisionStory: queued | creating | failed | created("created"=완성).
    """
    s = (raw or "").lower()
    if s in ("created", "complete", "completed"):
        return "completed"
    if s in ("failed", "error"):
        return "failed"
    return "processing"


async def get_generation_status(video_id: str) -> dict[str, Any]:
    """렌더 상태 조회(폴링용) — heygen.get_video_status 와 동일한 dict 형태."""
    if settings.VISIONSTORY_MOCK:
        return {
            "status": "completed",
            "video_url": settings.VISIONSTORY_MOCK_VIDEO_URL or None,
            "duration": None,
            "error": None,
        }
    resp = await _request_json(
        "GET", "/api/v1/video", params={"video_id": video_id}
    )
    if resp.status_code >= 400:
        raise VisionStoryError(
            f"VisionStory 상태 조회 오류 [{resp.status_code}]: {_error_text(resp)}"
        )
    data = (resp.json() or {}).get("data") or {}
    return {
        "status": _normalize_status(data.get("status")),
        "video_url": data.get("video_url"),
        "duration": data.get("duration"),  # VisionStory 미제공(None) — 회계는 근사치.
        "error": data.get("error") or data.get("message"),
    }
