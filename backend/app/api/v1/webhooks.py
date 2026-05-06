"""HeyGen 웹훅 API (app/api/webhooks.py 흡수)."""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.lecture import Lecture
from app.models.video_render import RenderStatus, VideoRender, WebhookEventLog
from app.services.pipeline import cost_log, notification, s3 as s3_svc
from app.services.pipeline.heygen import estimate_cost_usd
from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

VALID_EVENT_TYPES = {"avatar_video.success", "avatar_video.fail"}
_HEYGEN_PROVIDER = "heygen"


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
        # 멱등성 1단계: WebhookEventLog UNIQUE(provider, external_id, event_type)로
        # 동일 이벤트의 중복 처리를 차단. INSERT가 실패하면 이미 수신/처리된 이벤트.
        log = WebhookEventLog(
            provider=_HEYGEN_PROVIDER,
            external_id=video_id,
            event_type=event_type,
        )
        db.add(log)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            logger.info(
                "중복 HeyGen 웹훅 무시: job_id=%s, event_type=%s", video_id, event_type
            )
            return {"status": "duplicate", "video_id": video_id, "event_type": event_type}

        result = db.execute(
            select(VideoRender).where(VideoRender.heygen_job_id == video_id)
        )
        render = result.scalar_one_or_none()
        if not render:
            logger.warning("HeyGen 웹훅: 매칭되는 render 없음 job_id=%s, event_type=%s", video_id, event_type)
            db.commit()
            return {"status": "ignored", "reason": "unknown video_id"}

        # 멱등성 2단계: 이미 done/failed 상태인데 success가 다시 와도 200 + 무시.
        # (이벤트 로그는 위에서 이미 첫 수신을 막지만, 재발급 시 안전망으로 유지)
        if render.status in (RenderStatus.ready, RenderStatus.failed):
            logger.info(
                "이미 처리된 렌더에 대한 %s 이벤트 무시: render_id=%s, status=%s",
                event_type, render.id, render.status,
            )
            db.commit()
            return {"status": "already_processed", "render_id": str(render.id)}

        logger.info("HeyGen 웹훅 수신: job_id=%s, render_id=%s, event_type=%s", video_id, render.id, event_type)

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

            # record_once: 폴링 폴백과의 race / 웹훅 재발급 시 (video_render_id, operation)
            # UNIQUE 인덱스로 중복 비용 기록 방지. WebhookEventLog UNIQUE 가 1차 방어,
            # 이건 2차 안전망 — 두 경로(웹훅/폴링)가 같은 render 에 도달해도 1회만 기록.
            duration = event_data.get("duration")
            cost_log.record_once(db, render.id, "heygen", "video_render",
                                 cost_usd=estimate_cost_usd(duration),
                                 duration_seconds=duration)

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
