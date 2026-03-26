"""IFL HeyGen — 웹훅 수신 엔드포인트.

POST /api/webhooks/heygen

처리 흐름:
1. HeyGen 웹훅 시그니처 검증
2. video_id로 VideoRender 조회
3. completed → S3 업로드 → CostLog → Video.status=READY → 교수자 알림
4. failed → 에러 기록 → 교수자 알림
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.video import CostLog, VideoRender
from app.services import s3
from app.services.notification import notify_instructor

logger = logging.getLogger(__name__)

webhook_router = APIRouter(tags=["webhooks"])


def _verify_signature(payload: bytes, signature: str | None) -> bool:
    """HeyGen 웹훅 HMAC 시그니처를 검증한다."""
    if not settings.heygen_webhook_secret:
        return True  # 시크릿 미설정 시 검증 스킵 (개발 환경)
    if not signature:
        return False
    expected = hmac.new(
        settings.heygen_webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@webhook_router.post("/api/webhooks/heygen")
async def heygen_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_heygen_signature: str | None = Header(default=None),
):
    """HeyGen 비디오 생성 완료/실패 웹훅을 처리한다."""
    raw_body = await request.body()

    # 시그니처 검증
    if not _verify_signature(raw_body, x_heygen_signature):
        logger.warning("HeyGen 웹훅 시그니처 검증 실패")
        raise HTTPException(status_code=401, detail="Invalid signature")

    body = await request.json()
    event_type = body.get("event_type", "")
    event_data = body.get("event_data", {})
    video_id = event_data.get("video_id")

    if not video_id:
        logger.warning("웹훅에 video_id 없음: %s", body)
        return {"status": "ignored", "reason": "no video_id"}

    # VideoRender 조회
    stmt = select(VideoRender).where(VideoRender.heygen_job_id == video_id)
    result = await db.execute(stmt)
    render = result.scalar_one_or_none()

    if not render:
        logger.warning("video_id에 해당하는 렌더 없음: %s", video_id)
        return {"status": "ignored", "reason": "unknown video_id"}

    # 이미 완료된 작업은 스킵
    if render.status in ("READY", "FAILED"):
        logger.info("이미 처리된 렌더: render_id=%s, status=%s", render.id, render.status)
        return {"status": "already_processed"}

    heygen_status = event_data.get("status", "")

    if heygen_status == "completed" or event_type == "avatar_video.success":
        await _handle_completed(db, render, event_data)
    elif heygen_status == "failed" or event_type == "avatar_video.fail":
        await _handle_failed(db, render, event_data)
    else:
        logger.info("무시된 웹훅 이벤트: event_type=%s, status=%s", event_type, heygen_status)
        return {"status": "ignored", "reason": f"unhandled event: {event_type}"}

    await db.commit()
    return {"status": "ok", "render_id": str(render.id)}


async def _handle_completed(db: AsyncSession, render: VideoRender, event_data: dict) -> None:
    """렌더링 완료: S3 업로드 → CostLog → 상태 READY → 교수자 알림."""
    heygen_video_url = event_data.get("url")
    if not heygen_video_url:
        logger.error("completed 웹훅인데 url 없음: render_id=%s", render.id)
        render.status = "FAILED"
        render.error_message = "웹훅에 video URL 없음"
        return

    render.heygen_video_url = heygen_video_url
    render.status = "UPLOADING"
    await db.flush()

    # S3 업로드
    s3_url, upload_duration = await s3.upload_from_url(
        heygen_video_url, str(render.lecture_id), render.slide_number
    )
    render.s3_video_url = s3_url
    render.status = "READY"
    render.completed_at = datetime.now(timezone.utc)

    # 비용 로그 (async session이므로 직접 추가)
    db.add(CostLog(
        video_render_id=render.id,
        service="heygen",
        operation="video_render",
        duration_seconds=event_data.get("duration"),
        metadata_json=str({"video_url": heygen_video_url}),
    ))
    db.add(CostLog(
        video_render_id=render.id,
        service="s3",
        operation="upload_video",
        duration_seconds=upload_duration,
    ))

    # 교수자 알림
    await notify_instructor(
        instructor_id=render.instructor_id,
        lecture_id=render.lecture_id,
        status="READY",
        video_url=s3_url,
    )

    logger.info("웹훅 완료 처리: render_id=%s, s3_url=%s", render.id, s3_url)


async def _handle_failed(db: AsyncSession, render: VideoRender, event_data: dict) -> None:
    """렌더링 실패 처리."""
    error_msg = event_data.get("error", "HeyGen 렌더링 실패 (웹훅)")
    render.status = "FAILED"
    render.error_message = error_msg
    render.completed_at = datetime.now(timezone.utc)

    await notify_instructor(
        instructor_id=render.instructor_id,
        lecture_id=render.lecture_id,
        status="FAILED",
        error_message=error_msg,
    )

    logger.error("웹훅 실패 처리: render_id=%s, error=%s", render.id, error_msg)
