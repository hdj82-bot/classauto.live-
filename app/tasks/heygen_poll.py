"""HeyGen 웹훅 실패 대비 fallback 폴링 태스크 (10분 간격)."""

from __future__ import annotations

import json
import logging

import httpx

from app.celery_app import celery
from app.config import settings
from app.database import SessionLocal
from app.models.session_log import CostLog
from app.models.video import Video, VideoStatus
from app.services.notification import notify_video_ready
from app.services.s3 import upload_to_s3

logger = logging.getLogger(__name__)

HEYGEN_API_BASE = "https://api.heygen.com/v2"


@celery.task(name="heygen.poll_rendering_status")
def poll_rendering_status() -> dict:
    """RENDERING 상태인 모든 Video에 대해 HeyGen API를 폴링한다.

    Celery Beat에 의해 10분마다 실행된다.
    """
    db = SessionLocal()
    try:
        rendering_videos = (
            db.query(Video)
            .filter(Video.status == VideoStatus.RENDERING)
            .filter(Video.heygen_job_id.isnot(None))
            .all()
        )

        if not rendering_videos:
            return {"checked": 0, "completed": 0}

        logger.info("[HeyGen 폴링] %d개 렌더링 중인 영상 확인", len(rendering_videos))
        completed = 0

        for video in rendering_videos:
            try:
                result = _check_heygen_status(video.heygen_job_id)
                if result is None:
                    continue

                status = result.get("status", "")

                if status == "completed":
                    video_url = result.get("video_url", "")
                    if video_url:
                        _process_completed_video(db, video, video_url, result)
                        completed += 1

                elif status == "failed":
                    video.status = VideoStatus.FAILED
                    video.error_message = f"HeyGen 렌더링 실패 (폴링): {result.get('error', '')}"
                    db.commit()

            except Exception:
                logger.exception("HeyGen 폴링 실패: video_id=%d", video.id)

        return {"checked": len(rendering_videos), "completed": completed}
    finally:
        db.close()


def _check_heygen_status(heygen_job_id: str) -> dict | None:
    """HeyGen API로 영상 상태를 조회한다."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{HEYGEN_API_BASE}/video_status.get",
            params={"video_id": heygen_job_id},
            headers={"X-Api-Key": settings.heygen_api_key},
        )

    if resp.status_code != 200:
        logger.warning("HeyGen 상태 조회 실패: %d %s", resp.status_code, resp.text)
        return None

    return resp.json().get("data", {})


def _process_completed_video(db, video: Video, video_url: str, result: dict) -> None:
    """완료된 영상을 S3에 업로드하고 상태를 업데이트한다."""
    # 다운로드
    with httpx.Client(timeout=120) as client:
        resp = client.get(video_url)
        resp.raise_for_status()
        video_bytes = resp.content

    # S3 업로드
    s3_key = f"videos/{video.task_id}/v{video.version}/output.mp4"
    s3_url = upload_to_s3(file_bytes=video_bytes, s3_key=s3_key, content_type="video/mp4")

    # CostLog
    cost_amount = result.get("cost", 0.0)
    db.add(CostLog(
        video_id=video.id,
        service="heygen",
        operation="render_video",
        amount_usd=float(cost_amount),
        detail=json.dumps(result, ensure_ascii=False),
    ))

    # 상태 업데이트
    video.status = VideoStatus.READY
    video.s3_url = s3_url
    db.commit()

    # 알림
    notify_video_ready(video.task_id, video.filename, s3_url)
    logger.info("[HeyGen 폴링] video_id=%d → READY (S3: %s)", video.id, s3_url)
