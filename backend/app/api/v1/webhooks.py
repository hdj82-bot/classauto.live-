"""HeyGen 웹훅 API (app/api/webhooks.py 흡수)."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.lecture import Lecture
from app.models.video_render import VideoRender, RenderStatus
from app.services.pipeline import cost_log, notification, s3 as s3_svc
from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

VALID_EVENT_TYPES = {"avatar_video.success", "avatar_video.fail"}


@router.post("/heygen", summary="HeyGen 렌더링 웹훅")
async def heygen_webhook(
    request: Request,
    x_heygen_signature: str | None = Header(None),
):
    body = await request.body()

    # HMAC 검증 — 프로덕션에서는 시크릿과 서명 모두 필수
    if settings.HEYGEN_WEBHOOK_SECRET:
        if not x_heygen_signature:
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        expected = hmac.new(
            settings.HEYGEN_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, x_heygen_signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    else:
        logger.warning("HEYGEN_WEBHOOK_SECRET 미설정: 서명 검증 생략 (개발환경)")

    payload = await request.json()
    event_type = payload.get("event_type", "")
    event_data = payload.get("event_data", {})
    video_id = event_data.get("video_id")

    if not video_id:
        return {"status": "ignored", "reason": "no video_id"}

    if event_type not in VALID_EVENT_TYPES:
        logger.info("무시된 웹훅 이벤트: type=%s, video_id=%s", event_type, video_id)
        return {"status": "ignored", "reason": f"unhandled event_type: {event_type}"}

    db = SyncSessionLocal()
    try:
        result = db.execute(
            select(VideoRender).where(VideoRender.heygen_job_id == video_id)
        )
        render = result.scalar_one_or_none()
        if not render:
            logger.warning("알 수 없는 video_id 웹훅 수신: video_id=%s, event_type=%s", video_id, event_type)
            return {"status": "ignored", "reason": "unknown video_id"}

        # 멱등성: 이미 처리 완료된 렌더는 무시
        if render.status in (RenderStatus.ready, RenderStatus.failed):
            logger.info("이미 처리된 렌더: render_id=%s, status=%s", render.id, render.status)
            return {"status": "already_processed", "render_id": str(render.id)}

        if event_type == "avatar_video.success":
            heygen_url = event_data.get("url", "")
            if heygen_url:
                try:
                    s3_url, elapsed = await s3_svc.upload_from_url(
                        heygen_url, str(render.lecture_id), render.slide_number
                    )
                    render.s3_video_url = s3_url
                    render.heygen_video_url = heygen_url
                except Exception as exc:
                    logger.error("S3 업로드 실패: render_id=%s, error=%s", render.id, exc)
                    render.status = RenderStatus.failed
                    render.error_message = f"S3 업로드 실패: {exc}"
                    db.commit()
                    return {"status": "error", "reason": "s3_upload_failed"}

            render.status = RenderStatus.ready
            render.completed_at = datetime.now(timezone.utc)

            cost_log.record(db, render.id, "heygen", "video_render", cost_usd=0.0,
                            duration_seconds=event_data.get("duration"))

            # 첫 번째 슬라이드(slide_number=0 또는 1)인 경우 강의 썸네일 자동 생성
            video_url_for_thumb = render.s3_video_url or render.heygen_video_url
            if render.slide_number in (0, 1) and video_url_for_thumb:
                try:
                    thumb_url = await generate_thumbnail_from_video_url(
                        video_url_for_thumb, str(render.lecture_id)
                    )
                    if thumb_url:
                        lecture = db.query(Lecture).filter(Lecture.id == render.lecture_id).first()
                        if lecture and not lecture.thumbnail_url:
                            lecture.thumbnail_url = thumb_url
                except Exception as exc:
                    logger.warning("썸네일 생성 실패 (무시): render_id=%s, error=%s", render.id, exc)

            db.commit()

            try:
                await notification.notify_instructor(
                    render.instructor_id, render.lecture_id, "READY", render.s3_video_url
                )
            except Exception as exc:
                logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

        elif event_type == "avatar_video.fail":
            render.status = RenderStatus.failed
            render.error_message = event_data.get("error", "HeyGen rendering failed")
            db.commit()

            try:
                await notification.notify_instructor(
                    render.instructor_id, render.lecture_id, "FAILED",
                    error_message=render.error_message,
                )
            except Exception as exc:
                logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

        return {"status": "processed", "render_id": str(render.id)}
    finally:
        db.close()
