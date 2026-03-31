"""HeyGen 렌더링 폴백 폴링 태스크."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.models.video_render import VideoRender
from app.services.pipeline import cost_log, notification, s3 as s3_svc
from app.services.pipeline.heygen import get_video_status

logger = logging.getLogger(__name__)


@celery.task
def poll_pending_renders() -> dict:
    """RENDERING 상태인 VideoRender를 HeyGen API로 폴링."""
    db = SyncSessionLocal()
    try:
        renders = db.query(VideoRender).filter(VideoRender.status == "RENDERING").all()

        if not renders:
            return {"checked": 0}

        loop = asyncio.new_event_loop()
        completed = 0
        failed = 0

        for render in renders:
            if not render.heygen_job_id:
                continue
            try:
                status_data = loop.run_until_complete(get_video_status(render.heygen_job_id))

                if status_data["status"] == "completed" and status_data.get("video_url"):
                    s3_url, elapsed = loop.run_until_complete(
                        s3_svc.upload_from_url(status_data["video_url"], str(render.lecture_id), render.slide_number)
                    )
                    render.s3_video_url = s3_url
                    render.heygen_video_url = status_data["video_url"]
                    render.status = "READY"
                    render.completed_at = datetime.now(timezone.utc)

                    cost_log.record(db, render.id, "s3", "upload_video", duration_seconds=elapsed)
                    cost_log.record(db, render.id, "heygen", "video_render", cost_usd=0.0,
                                    duration_seconds=status_data.get("duration"))

                    loop.run_until_complete(
                        notification.notify_instructor(render.instructor_id, render.lecture_id, "READY", s3_url)
                    )
                    completed += 1

                elif status_data["status"] == "failed":
                    render.status = "FAILED"
                    render.error_message = status_data.get("error", "HeyGen rendering failed")
                    loop.run_until_complete(
                        notification.notify_instructor(
                            render.instructor_id, render.lecture_id, "FAILED",
                            error_message=render.error_message,
                        )
                    )
                    failed += 1

            except Exception as exc:
                logger.error("폴링 실패: render_id=%s, error=%s", render.id, exc)

        db.commit()
        loop.close()
        return {"checked": len(renders), "completed": completed, "failed": failed}
    finally:
        db.close()
