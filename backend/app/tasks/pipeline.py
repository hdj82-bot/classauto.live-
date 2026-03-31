"""5단계 PPT→임베딩→스크립트→검토대기→알림 Celery 파이프라인."""
from __future__ import annotations

import logging
import os
import uuid

from celery import chain

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.services.pipeline.schemas import SlideContent

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")


class PipelineTask(celery.Task):
    """파이프라인 공통 베이스 — 실패 시 상태를 FAILED로 마킹."""
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("파이프라인 태스크 실패: task_id=%s, error=%s", task_id, exc)


@celery.task(base=PipelineTask, bind=True)
def step1_parse(self, task_id: str, file_path: str) -> dict:
    """Step 1: PPTX 파싱 — 슬라이드 텍스트, 이미지, 노트 추출."""
    from app.services.pipeline.parser import parse_pptx

    output_dir = os.path.join(UPLOAD_DIR, task_id, "images")
    slides = parse_pptx(file_path, output_dir)

    slides_data = [
        {
            "slide_number": s.slide_number,
            "texts": s.texts,
            "speaker_notes": s.speaker_notes,
            "image_paths": s.image_paths,
        }
        for s in slides
    ]

    logger.info("Step1 완료: task_id=%s, %d 슬라이드", task_id, len(slides))
    return {"task_id": task_id, "slides": slides_data}


@celery.task(base=PipelineTask, bind=True)
def step2_embed(self, prev_result: dict) -> dict:
    """Step 2: OpenAI 임베딩 생성 → pgvector 저장."""
    from app.services.pipeline.embedding import store_slide_embeddings

    task_id = prev_result["task_id"]
    slides_data = prev_result["slides"]
    slides = [SlideContent(**sd) for sd in slides_data]

    db = SyncSessionLocal()
    try:
        count = store_slide_embeddings(db, task_id, slides)
        db.commit()
        logger.info("Step2 완료: task_id=%s, %d 임베딩 저장", task_id, count)
    finally:
        db.close()

    return prev_result


@celery.task(base=PipelineTask, bind=True)
def step3_generate_scripts(self, prev_result: dict) -> dict:
    """Step 3: Claude API 스크립트 생성."""
    from app.services.pipeline.script_generator import generate_scripts

    task_id = prev_result["task_id"]
    slides_data = prev_result["slides"]
    slides = [SlideContent(**sd) for sd in slides_data]

    scripts = generate_scripts(slides)

    scripts_data = [{"slide_number": s.slide_number, "script": s.script} for s in scripts]
    logger.info("Step3 완료: task_id=%s, %d 스크립트 생성", task_id, len(scripts))
    return {**prev_result, "scripts": scripts_data}


@celery.task(base=PipelineTask, bind=True)
def step4_mark_pending_review(self, prev_result: dict) -> dict:
    """Step 4: PENDING_REVIEW 상태로 마킹."""
    task_id = prev_result["task_id"]
    logger.info("Step4 완료: task_id=%s → PENDING_REVIEW", task_id)
    return {**prev_result, "status": "PENDING_REVIEW"}


@celery.task(base=PipelineTask, bind=True)
def step5_notify(self, prev_result: dict) -> dict:
    """Step 5: 교수자에게 알림."""
    import asyncio
    from app.services.pipeline.notification import notify_instructor

    task_id = prev_result["task_id"]
    instructor_id = prev_result.get("instructor_id")
    lecture_id = prev_result.get("lecture_id")

    if instructor_id and lecture_id:
        asyncio.get_event_loop().run_until_complete(
            notify_instructor(
                instructor_id=uuid.UUID(instructor_id),
                lecture_id=uuid.UUID(lecture_id),
                status="PENDING_REVIEW",
            )
        )

    logger.info("Step5 완료: task_id=%s, 알림 전송", task_id)
    return prev_result


def start_pipeline(task_id: str, file_path: str, instructor_id: str | None = None, lecture_id: str | None = None):
    """5단계 Celery 체인 파이프라인을 시작."""
    pipeline = chain(
        step1_parse.s(task_id, file_path),
        step2_embed.s(),
        step3_generate_scripts.s(),
        step4_mark_pending_review.s(),
        step5_notify.s(),
    )
    return pipeline.apply_async()
