"""IFL HeyGen — 교수자 알림 서비스."""

from __future__ import annotations

import logging
import uuid

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def notify_instructor(
    instructor_id: uuid.UUID,
    lecture_id: uuid.UUID,
    status: str,
    video_url: str | None = None,
    error_message: str | None = None,
) -> None:
    """교수자에게 렌더링 완료/실패 알림을 전송한다.

    notification_webhook_url이 설정되어 있으면 POST 요청을 보내고,
    미설정 시 로그만 남긴다.
    """
    payload = {
        "type": "heygen_render",
        "instructor_id": str(instructor_id),
        "lecture_id": str(lecture_id),
        "status": status,
        "video_url": video_url,
        "error_message": error_message,
    }

    if not settings.notification_webhook_url:
        logger.info("알림 전송 (webhook 미설정, 로그만): %s", payload)
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(settings.notification_webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("교수자 알림 전송 완료: instructor_id=%s, status=%s", instructor_id, status)
    except Exception as exc:
        logger.error("교수자 알림 전송 실패: %s", exc)
