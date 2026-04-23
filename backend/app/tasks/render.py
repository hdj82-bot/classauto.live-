"""단일 슬라이드 렌더링 태스크: TTS → S3 → HeyGen."""
from __future__ import annotations

import logging
import uuid

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.models.video_render import RenderStatus, VideoRender
from app.services.pipeline import cost_log, s3 as s3_svc

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2, default_retry_delay=30)
def render_slide(self, render_id: str, script_text: str) -> dict:
    """TTS 합성 → S3 업로드 → HeyGen 비디오 생성 요청."""
    import asyncio
    from app.services.pipeline.tts import synthesize
    from app.services.pipeline.heygen import create_video

    db = SyncSessionLocal()
    try:
        render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()
        render.status = RenderStatus.tts_processing
        db.commit()

        # TTS 합성
        loop = asyncio.new_event_loop()
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
        loop.close()
        render.heygen_job_id = heygen_job_id
        db.commit()

        logger.info("렌더 파이프라인 시작 완료: render_id=%s, heygen_job_id=%s", render_id, heygen_job_id)
        return {"render_id": render_id, "heygen_job_id": heygen_job_id}

    except Exception as exc:
        db.rollback()
        render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()
        render.status = RenderStatus.failed
        render.error_message = str(exc)
        db.commit()
        logger.error("렌더 실패: render_id=%s, error=%s", render_id, exc)
        raise self.retry(exc=exc)
    finally:
        db.close()
