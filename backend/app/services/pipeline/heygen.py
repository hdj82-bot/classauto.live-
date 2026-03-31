"""HeyGen API 클라이언트."""
from __future__ import annotations

import logging
import asyncio
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_BASE_DELAY = 2.0  # 초


class HeyGenError(Exception):
    """HeyGen API 호출 실패."""


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────


def _headers() -> dict[str, str]:
    return {
        "X-Api-Key": settings.HEYGEN_API_KEY,
        "Content-Type": "application/json",
    }


async def _request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict | None = None,
    json: dict | None = None,
    params: dict | None = None,
    timeout: float = 60.0,
) -> httpx.Response:
    """Exponential backoff 재시도가 포함된 HTTP 요청."""
    hdrs = headers or _headers()
    last_exc: Exception | None = None

    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, headers=hdrs, json=json, params=params)

            if resp.status_code not in _RETRYABLE_STATUS:
                return resp

            logger.warning(
                "HeyGen API %s %s → %d (시도 %d/%d)",
                method, url, resp.status_code, attempt + 1, _MAX_RETRIES,
            )
            last_exc = HeyGenError(f"HTTP {resp.status_code}: {resp.text}")

        except httpx.TimeoutException as exc:
            logger.warning("HeyGen API 타임아웃 (시도 %d/%d): %s", attempt + 1, _MAX_RETRIES, exc)
            last_exc = exc

        if attempt < _MAX_RETRIES - 1:
            delay = _BASE_DELAY * (2 ** attempt)
            await asyncio.sleep(delay)

    raise HeyGenError(f"HeyGen API 최대 재시도 초과: {last_exc}")


# ── 비디오 생성 ──────────────────────────────────────────────────────────────


async def create_video(
    audio_url: str,
    avatar_id: str | None = None,
    callback_id: str | None = None,
) -> str:
    """HeyGen v2 API로 아바타 립싱크 비디오 생성 요청. video_id를 반환."""
    avatar = avatar_id or settings.HEYGEN_AVATAR_ID
    url = f"{settings.HEYGEN_BASE_URL}/v2/video/generate"
    payload = {
        "video_inputs": [
            {
                "character": {"type": "avatar", "avatar_id": avatar, "avatar_style": "normal"},
                "voice": {"type": "audio", "audio_url": audio_url},
            }
        ],
        "dimension": {"width": 1920, "height": 1080},
        "callback_id": callback_id or "",
        "callback_url": settings.HEYGEN_CALLBACK_URL,
    }

    resp = await _request_with_retry("POST", url, json=payload)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen API 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    video_id = data.get("video_id")
    if not video_id:
        raise HeyGenError(f"HeyGen 응답에 video_id 없음: {resp.text}")

    logger.info("HeyGen 비디오 생성 요청 완료: video_id=%s", video_id)
    return video_id


# ── 비디오 상태 조회 ─────────────────────────────────────────────────────────


async def get_video_status(video_id: str) -> dict:
    """HeyGen 비디오 상태 조회 (폴링용)."""
    url = f"{settings.HEYGEN_BASE_URL}/v1/video_status.get"
    params = {"video_id": video_id}

    resp = await _request_with_retry("GET", url, params=params, timeout=30.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 상태 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    return {
        "status": data.get("status", "unknown"),
        "video_url": data.get("video_url"),
        "duration": data.get("duration"),
        "error": data.get("error"),
    }


# ── 아바타 목록 조회 ─────────────────────────────────────────────────────────


async def list_avatars() -> list[dict[str, Any]]:
    """사용 가능한 아바타 목록 조회."""
    url = f"{settings.HEYGEN_BASE_URL}/v2/avatars"

    resp = await _request_with_retry("GET", url, timeout=30.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 아바타 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    avatars = data.get("avatars", [])

    return [
        {
            "avatar_id": a.get("avatar_id"),
            "avatar_name": a.get("avatar_name"),
            "gender": a.get("gender"),
            "preview_image_url": a.get("preview_image_url"),
            "preview_video_url": a.get("preview_video_url"),
        }
        for a in avatars
    ]


# ── 비디오 삭제 ──────────────────────────────────────────────────────────────


async def delete_video(video_id: str) -> bool:
    """HeyGen 비디오 삭제."""
    url = f"{settings.HEYGEN_BASE_URL}/v1/video.delete"
    payload = {"video_ids": [video_id]}

    try:
        resp = await _request_with_retry("POST", url, json=payload, timeout=30.0)
        if resp.status_code == 200:
            logger.info("HeyGen 비디오 삭제 완료: %s", video_id)
            return True
        logger.warning("HeyGen 비디오 삭제 실패 [%d]: %s", resp.status_code, resp.text)
        return False
    except HeyGenError as e:
        logger.error("HeyGen 비디오 삭제 오류: %s — %s", video_id, e)
        return False


# ── 남은 크레딧 조회 ─────────────────────────────────────────────────────────


async def get_remaining_quota() -> dict:
    """HeyGen 계정 잔여 크레딧 조회."""
    url = f"{settings.HEYGEN_BASE_URL}/v2/user/remaining_quota"

    resp = await _request_with_retry("GET", url, timeout=15.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 크레딧 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    return {
        "remaining_quota": data.get("remaining_quota", 0),
        "details": data,
    }
