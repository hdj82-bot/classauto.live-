"""IFL HeyGen — 렌더링 파이프라인 Celery 태스크."""

from __future__ import annotations

import asyncio
import logging
import uuid

from app.celery_app import celery
from app.database import SyncSessionLocal
from app.models.video import VideoRender
from app.services import cost_log, s3, tts

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Celery sync 워커에서 async 함수를 실행하는 헬퍼."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(bind=True, max_retries=2, default_retry_delay=30)
def process_render(self, render_id: str) -> dict:
    """단일 슬라이드 렌더링 파이프라인.

    1) TTS 합성 (ElevenLabs → Google Cloud TTS 폴백)
    2) 오디오 S3 업로드
    3) HeyGen API 비디오 생성 요청
    4) job_id 저장 (웹훅 또는 폴링으로 완료 처리)
    """
    from app.services.heygen import HeyGenError, create_video

    db = SyncSessionLocal()
    try:
        render = db.get(VideoRender, uuid.UUID(render_id))
        if not render:
            logger.error("VideoRender not found: %s", render_id)
            return {"error": "not_found"}

        # ── Step 1: TTS 합성 ────────────────────────────────
        render.status = "TTS_PROCESSING"
        db.commit()

        tts_result = _run_async(tts.synthesize(render.script_text))
        render.tts_provider = tts_result.provider

        cost_log.record(
            db,
            video_render_id=render.id,
            service=tts_result.provider,
            operation="tts_synthesize",
            duration_seconds=tts_result.duration_seconds,
            metadata={"text_length": len(render.script_text or "")},
        )

        # ── Step 2: 오디오 S3 업로드 ───────────────────────
        audio_url = s3.upload_audio_bytes(tts_result.audio_bytes, str(render.id))
        render.audio_url = audio_url

        cost_log.record(
            db,
            video_render_id=render.id,
            service="s3",
            operation="upload_audio",
        )
        db.commit()

        # ── Step 3: HeyGen 비디오 생성 요청 ─────────────────
        render.status = "RENDERING"
        db.commit()

        video_id = _run_async(
            create_video(
                audio_url=audio_url,
                avatar_id=render.avatar_id,
                callback_id=str(render.id),
            )
        )
        render.heygen_job_id = video_id

        cost_log.record(
            db,
            video_render_id=render.id,
            service="heygen",
            operation="create_video",
            metadata={"video_id": video_id, "avatar_id": render.avatar_id},
        )
        db.commit()

        logger.info(
            "렌더링 요청 완료: render_id=%s, heygen_job_id=%s", render_id, video_id
        )
        return {"render_id": render_id, "heygen_job_id": video_id, "status": "RENDERING"}

    except HeyGenError as exc:
        logger.error("HeyGen API 오류: %s", exc)
        if render:
            render.status = "FAILED"
            render.error_message = str(exc)
            db.commit()
        raise self.retry(exc=exc)

    except Exception as exc:
        logger.exception("렌더링 파이프라인 실패: render_id=%s", render_id)
        if render:
            render.status = "FAILED"
            render.error_message = str(exc)
            db.commit()
        return {"render_id": render_id, "error": str(exc)}

    finally:
        db.close()
