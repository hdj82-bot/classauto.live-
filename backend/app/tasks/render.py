"""단일 슬라이드 렌더링 태스크: TTS → S3 → HeyGen."""
from __future__ import annotations

import logging
import uuid

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.models.video_render import RenderStatus, VideoRender
from app.services.pipeline import cost_log, s3 as s3_svc

logger = logging.getLogger(__name__)


def _archive_videos_for_lecture(lecture_id: uuid.UUID) -> None:
    """렌더 최종 실패 시 해당 강의의 rendering 상태 Video를 archived로 마킹."""
    from sqlalchemy import select
    from app.models.video import Video, VideoStatus

    db = SyncSessionLocal()
    try:
        videos = db.execute(
            select(Video).where(
                Video.lecture_id == lecture_id,
                Video.status == VideoStatus.rendering,
            )
        ).scalars().all()
        for video in videos:
            video.status = VideoStatus.archived
        if videos:
            db.commit()
            logger.warning(
                "렌더 최종 실패로 Video %d개를 archived로 마킹: lecture_id=%s",
                len(videos), lecture_id,
            )
    except Exception as db_exc:
        db.rollback()
        logger.error("Video archived 마킹 실패: lecture_id=%s, error=%s", lecture_id, db_exc)
    finally:
        db.close()


@celery.task(bind=True, max_retries=2, default_retry_delay=30)
def render_slide(self, render_id: str, script_text: str) -> dict:
    """TTS 합성 → S3 업로드 → HeyGen 비디오 생성 요청."""
    import asyncio
    from app.services.pipeline.tts import synthesize
    from app.services.pipeline.heygen import create_video

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()
        render.status = RenderStatus.tts_processing
        db.commit()

        # TTS 합성
        tts_result = loop.run_until_complete(synthesize(script_text))

        cost_log.record(
            db, render.id, service=tts_result.provider, operation="tts_synthesize",
            cost_usd=0.0, duration_seconds=tts_result.duration_seconds,
        )

        # S3 오디오 업로드
        audio_url = s3_svc.upload_audio_bytes(tts_result.audio_bytes, str(render.id))
        render.audio_url = audio_url
        render.tts_provider = tts_result.provider
        db.commit()

        # HeyGen 비디오 생성
        render.status = RenderStatus.rendering
        db.commit()

        heygen_job_id = loop.run_until_complete(
            create_video(audio_url=audio_url, avatar_id=render.avatar_id, callback_id=str(render.id))
        )
        render.heygen_job_id = heygen_job_id
        db.commit()

        logger.info("렌더 파이프라인 시작 완료: render_id=%s, heygen_job_id=%s", render_id, heygen_job_id)
        return {"render_id": render_id, "heygen_job_id": heygen_job_id}

    except Exception as exc:
        db.rollback()
        is_final_failure = self.request.retries >= self.max_retries
        if is_final_failure:
            lecture_id = None
            try:
                render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()
                render.status = RenderStatus.failed
                render.error_message = str(exc)
                lecture_id = render.lecture_id
                db.commit()
            except Exception:
                db.rollback()
            if lecture_id:
                _archive_videos_for_lecture(lecture_id)
        logger.error(
            "렌더 실패: render_id=%s, retries=%d/%d, error=%s",
            render_id, self.request.retries, self.max_retries, exc,
        )
        raise self.retry(exc=exc)
    finally:
        loop.close()
        db.close()
