"""HeyGen 렌더링 폴백 폴링 태스크."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.models.lecture import Lecture
from app.models.video_render import VideoRender
from app.services.pipeline import cost_log, notification, s3 as s3_svc
from app.services.pipeline.heygen import get_video_status
from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

logger = logging.getLogger(__name__)

# 24시간 이상 RENDERING 상태인 렌더는 타임아웃 처리
RENDER_TIMEOUT_HOURS = 24


@celery.task
def poll_pending_renders() -> dict:
    """RENDERING 상태인 VideoRender를 HeyGen API로 폴링."""
    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        renders = db.query(VideoRender).filter(VideoRender.status == "RENDERING").all()

        if not renders:
            return {"checked": 0}

        completed = 0
        failed = 0
        timeout_cutoff = datetime.now(timezone.utc) - timedelta(hours=RENDER_TIMEOUT_HOURS)

        for render in renders:
            if not render.heygen_job_id:
                continue

            # 타임아웃 검사: 너무 오래된 렌더링은 실패 처리
            created = getattr(render, "created_at", None)
            if isinstance(created, datetime) and created < timeout_cutoff:
                render.status = "FAILED"
                render.error_message = f"렌더링 타임아웃 ({RENDER_TIMEOUT_HOURS}시간 초과)"
                failed += 1
                logger.warning("렌더링 타임아웃: render_id=%s", render.id)
                continue

            # 이미 웹훅으로 처리 완료된 경우 건너뜀 (레이스 컨디션 방지)
            db.refresh(render)
            if render.status in ("READY", "FAILED"):
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

                    # 첫 슬라이드인 경우 강의 썸네일 생성
                    if render.slide_number in (0, 1) and s3_url:
                        try:
                            thumb_url = loop.run_until_complete(
                                generate_thumbnail_from_video_url(s3_url, str(render.lecture_id))
                            )
                            if thumb_url:
                                lecture = db.query(Lecture).filter(Lecture.id == render.lecture_id).first()
                                if lecture and not lecture.thumbnail_url:
                                    lecture.thumbnail_url = thumb_url
                        except Exception as exc:
                            logger.warning("썸네일 생성 실패 (무시): render_id=%s, error=%s", render.id, exc)

                    try:
                        loop.run_until_complete(
                            notification.notify_instructor(render.instructor_id, render.lecture_id, "READY", s3_url)
                        )
                    except Exception as exc:
                        logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

                    completed += 1

                elif status_data["status"] == "failed":
                    render.status = "FAILED"
                    render.error_message = status_data.get("error", "HeyGen rendering failed")

                    try:
                        loop.run_until_complete(
                            notification.notify_instructor(
                                render.instructor_id, render.lecture_id, "FAILED",
                                error_message=render.error_message,
                            )
                        )
                    except Exception as exc:
                        logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

                    failed += 1

            except Exception as exc:
                logger.error("폴링 실패: render_id=%s, error=%s", render.id, exc)

        db.commit()
        return {"checked": len(renders), "completed": completed, "failed": failed}
    finally:
        loop.close()
        db.close()
