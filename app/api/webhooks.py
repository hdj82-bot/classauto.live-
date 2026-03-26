"""HeyGen 웹훅 수신 API."""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.session_log import CostLog
from app.models.video import Video, VideoStatus
from app.services.notification import notify_video_ready
from app.services.s3 import upload_to_s3

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# --------------------------------------------------------------------------
# 스키마
# --------------------------------------------------------------------------

class HeyGenWebhookPayload(BaseModel):
    event_type: str               # "avatar_video.success", "avatar_video.fail"
    event_data: dict              # {"video_id": "...", "url": "...", "status": "..."}


# --------------------------------------------------------------------------
# POST /api/webhooks/heygen — HeyGen 렌더링 완료 웹훅
# --------------------------------------------------------------------------

@router.post("/heygen")
async def heygen_webhook(payload: HeyGenWebhookPayload, db: Session = Depends(get_db)):
    """HeyGen 영상 렌더링 완료 웹훅을 수신한다.

    처리 순서:
    1. Video 조회
    2. 영상 다운로드 → S3 업로드
    3. CostLog 기록
    4. Video.status = READY
    5. 교수자 알림
    """
    heygen_video_id = payload.event_data.get("video_id", "")
    logger.info("[HeyGen 웹훅] event=%s, heygen_video_id=%s", payload.event_type, heygen_video_id)

    # Video 조회
    video = db.query(Video).filter(Video.heygen_job_id == heygen_video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail=f"heygen_job_id={heygen_video_id}에 해당하는 Video 없음")

    # 실패 이벤트 처리
    if payload.event_type != "avatar_video.success":
        error_msg = payload.event_data.get("error", payload.event_type)
        video.status = VideoStatus.FAILED
        video.error_message = f"HeyGen 렌더링 실패: {error_msg}"
        db.commit()
        logger.error("[HeyGen] 렌더링 실패: video_id=%d, error=%s", video.id, error_msg)
        return {"status": "fail_recorded"}

    # 1. 영상 다운로드
    video_url = payload.event_data.get("url", "")
    if not video_url:
        raise HTTPException(status_code=400, detail="영상 URL이 웹훅 페이로드에 없습니다.")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(video_url)
        resp.raise_for_status()
        video_bytes = resp.content

    # 2. S3 업로드
    s3_key = f"videos/{video.task_id}/v{video.version}/output.mp4"
    s3_url = upload_to_s3(file_bytes=video_bytes, s3_key=s3_key, content_type="video/mp4")

    # 3. CostLog 기록
    cost_amount = payload.event_data.get("cost", 0.0)
    cost_log = CostLog(
        video_id=video.id,
        service="heygen",
        operation="render_video",
        amount_usd=float(cost_amount),
        detail=json.dumps(payload.event_data, ensure_ascii=False),
    )
    db.add(cost_log)

    # 4. Video 상태 업데이트
    video.status = VideoStatus.READY
    video.s3_url = s3_url
    db.commit()

    # 5. 교수자 알림
    notify_video_ready(video.task_id, video.filename, s3_url)

    logger.info("[HeyGen] 처리 완료: video_id=%d → READY, s3=%s", video.id, s3_url)
    return {"status": "ok", "s3_url": s3_url}
