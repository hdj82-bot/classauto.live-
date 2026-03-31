"""HeyGen 웹훅 API (app/api/webhooks.py 흡수)."""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.video_render import VideoRender
from app.services.pipeline import cost_log, notification, s3 as s3_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@router.post("/heygen", summary="HeyGen 렌더링 웹훅")
async def heygen_webhook(
    request: Request,
    x_heygen_signature: str | None = Header(None),
):
    body = await request.body()

    # HMAC 검증
    if settings.HEYGEN_WEBHOOK_SECRET and x_heygen_signature:
        expected = hmac.new(
            settings.HEYGEN_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, x_heygen_signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()
    event_type = payload.get("event_type", "")
    event_data = payload.get("event_data", {})
    video_id = event_data.get("video_id")

    if not video_id:
        return {"status": "ignored", "reason": "no video_id"}

    db = SyncSessionLocal()
    try:
        result = db.execute(
            select(VideoRender).where(VideoRender.heygen_job_id == video_id)
        )
        render = result.scalar_one_or_none()
        if not render:
            return {"status": "ignored", "reason": "unknown video_id"}

        if event_type == "avatar_video.success":
            heygen_url = event_data.get("url", "")
            if heygen_url:
                import asyncio
                loop = asyncio.get_event_loop()
                s3_url, elapsed = loop.run_until_complete(
                    s3_svc.upload_from_url(heygen_url, str(render.lecture_id), render.slide_number)
                )
                render.s3_video_url = s3_url
                render.heygen_video_url = heygen_url

            render.status = "READY"
            render.completed_at = datetime.now(timezone.utc)

            cost_log.record(db, render.id, "heygen", "video_render", cost_usd=0.0,
                            duration_seconds=event_data.get("duration"))

            db.commit()

            import asyncio
            asyncio.get_event_loop().run_until_complete(
                notification.notify_instructor(render.instructor_id, render.lecture_id, "READY", render.s3_video_url)
            )

        elif event_type == "avatar_video.fail":
            render.status = "FAILED"
            render.error_message = event_data.get("error", "HeyGen rendering failed")
            db.commit()

            import asyncio
            asyncio.get_event_loop().run_until_complete(
                notification.notify_instructor(
                    render.instructor_id, render.lecture_id, "FAILED",
                    error_message=render.error_message,
                )
            )

        return {"status": "processed", "render_id": str(render.id)}
    finally:
        db.close()
