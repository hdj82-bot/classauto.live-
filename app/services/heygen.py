"""IFL HeyGen — HeyGen API 클라이언트."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class HeyGenError(Exception):
    """HeyGen API 호출 실패."""


async def create_video(
    audio_url: str,
    avatar_id: str | None = None,
    callback_id: str | None = None,
) -> str:
    """HeyGen v2 API로 아바타 립싱크 비디오 생성을 요청한다.

    Returns:
        video_id (= job_id): HeyGen에서 반환한 비디오 식별자.
    """
    avatar = avatar_id or settings.heygen_avatar_id
    url = f"{settings.heygen_base_url}/v2/video/generate"
    headers = {
        "X-Api-Key": settings.heygen_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": avatar,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "audio",
                    "audio_url": audio_url,
                },
            }
        ],
        "dimension": {"width": 1920, "height": 1080},
        "callback_id": callback_id or "",
        "callback_url": settings.heygen_callback_url,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen API 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    video_id = data.get("video_id")
    if not video_id:
        raise HeyGenError(f"HeyGen 응답에 video_id 없음: {resp.text}")

    logger.info("HeyGen 비디오 생성 요청 완료: video_id=%s", video_id)
    return video_id


async def get_video_status(video_id: str) -> dict:
    """HeyGen 비디오 상태를 조회한다 (폴링용).

    Returns:
        {"status": "completed"|"processing"|"failed", "video_url": "...", "error": "..."}
    """
    url = f"{settings.heygen_base_url}/v1/video_status.get"
    headers = {"X-Api-Key": settings.heygen_api_key}
    params = {"video_id": video_id}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 상태 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    return {
        "status": data.get("status", "unknown"),
        "video_url": data.get("video_url"),
        "duration": data.get("duration"),
        "error": data.get("error"),
    }
