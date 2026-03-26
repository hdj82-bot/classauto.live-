"""IFL HeyGen — Fallback 폴링 태스크 (10분 간격)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.celery_app import celery
from app.database import SyncSessionLocal
from app.models.video import VideoRender
from app.services import cost_log, s3
from app.services.heygen import get_video_status
from app.services.notification import notify_instructor

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.polling.poll_pending_renders")
def poll_pending_renders() -> dict:
    """RENDERING 상태인 작업들의 HeyGen 상태를 폴링한다.

    웹훅이 누락되었을 때를 대비한 fallback 메커니즘.
    """
    db = SyncSessionLocal()
    try:
        stmt = select(VideoRender).where(VideoRender.status == "RENDERING")
        renders = db.execute(stmt).scalars().all()

        if not renders:
            logger.debug("폴링 대상 없음")
            return {"checked": 0, "completed": 0, "failed": 0}

        completed = 0
        failed = 0

        for render in renders:
            try:
                result = _run_async(get_video_status(render.heygen_job_id))
                heygen_status = result["status"]

                if heygen_status == "completed":
                    _handle_completed(db, render, result)
                    completed += 1
                elif heygen_status == "failed":
                    _handle_failed(db, render, result.get("error", "HeyGen 렌더링 실패"))
                    failed += 1
                # processing → 대기

            except Exception as exc:
                logger.error(
                    "폴링 중 오류: render_id=%s, error=%s", render.id, exc
                )

        db.commit()
        summary = {"checked": len(renders), "completed": completed, "failed": failed}
        logger.info("폴링 완료: %s", summary)
        return summary

    finally:
        db.close()


def _handle_completed(db, render: VideoRender, result: dict) -> None:
    """렌더링 완료 처리: S3 업로드 → CostLog → 상태 업데이트 → 알림."""
    heygen_video_url = result.get("video_url")
    if not heygen_video_url:
        logger.warning("completed인데 video_url 없음: render_id=%s", render.id)
        return

    render.heygen_video_url = heygen_video_url

    # S3 업로드
    render.status = "UPLOADING"
    db.flush()

    s3_url, upload_duration = _run_async(
        s3.upload_from_url(heygen_video_url, str(render.lecture_id), render.slide_number)
    )
    render.s3_video_url = s3_url
    render.status = "READY"
    render.completed_at = datetime.now(timezone.utc)

    # 비용 로그
    cost_log.record(
        db,
        video_render_id=render.id,
        service="heygen",
        operation="video_render",
        duration_seconds=result.get("duration"),
        metadata={"video_url": heygen_video_url},
    )
    cost_log.record(
        db,
        video_render_id=render.id,
        service="s3",
        operation="upload_video",
        duration_seconds=upload_duration,
    )

    db.flush()

    # 교수자 알림
    _run_async(
        notify_instructor(
            instructor_id=render.instructor_id,
            lecture_id=render.lecture_id,
            status="READY",
            video_url=s3_url,
        )
    )
    logger.info("렌더링 완료 (폴링): render_id=%s, s3_url=%s", render.id, s3_url)


def _handle_failed(db, render: VideoRender, error: str) -> None:
    """렌더링 실패 처리."""
    render.status = "FAILED"
    render.error_message = error
    render.completed_at = datetime.now(timezone.utc)
    db.flush()

    _run_async(
        notify_instructor(
            instructor_id=render.instructor_id,
            lecture_id=render.lecture_id,
            status="FAILED",
            error_message=error,
        )
    )
    logger.error("렌더링 실패 (폴링): render_id=%s, error=%s", render.id, error)
