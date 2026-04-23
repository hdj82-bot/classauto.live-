"""5단계 PPT→임베딩→스크립트→검토대기→알림 Celery 파이프라인."""
from __future__ import annotations

import logging
import os
import tempfile
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


@celery.task(base=PipelineTask, bind=True, max_retries=2, default_retry_delay=30)
def step1_parse(
    self,
    task_id: str,
    s3_key: str,
    instructor_id: str | None = None,
    lecture_id: str | None = None,
) -> dict:
    """Step 1: S3에서 PPT 다운로드 → PPTX 파싱 — 슬라이드 텍스트, 이미지, 노트 추출."""
    from app.services.pipeline.parser import parse_pptx
    from app.services.pipeline import s3 as s3_svc

    # S3에서 PPT 다운로드 → 임시 파일에 저장
    try:
        ppt_bytes = s3_svc.download_file(s3_key)
    except Exception as exc:
        logger.error("Step1 S3 다운로드 실패: task_id=%s, s3_key=%s, error=%s", task_id, s3_key, exc)
        raise self.retry(exc=exc)

    tmp_dir = os.path.join(UPLOAD_DIR, task_id)
    os.makedirs(tmp_dir, exist_ok=True)
    local_path = os.path.join(tmp_dir, os.path.basename(s3_key))
    with open(local_path, "wb") as f:
        f.write(ppt_bytes)

    try:
        output_dir = os.path.join(tmp_dir, "images")
        slides = parse_pptx(local_path, output_dir)
    except Exception as exc:
        logger.error("Step1 PPTX 파싱 실패: task_id=%s, error=%s", task_id, exc)
        raise RuntimeError(f"PPT 파싱 실패: {exc}") from exc

    if not slides:
        raise RuntimeError(f"PPT에 슬라이드가 없습니다: task_id={task_id}")

    slides_data = [
        {
            "slide_number": s.slide_number,
            "texts": s.texts,
            "speaker_notes": s.speaker_notes,
            "image_paths": s.image_paths,
        }
        for s in slides
    ]

    logger.info("Step1 완료: task_id=%s, %d 슬라이드 (S3: %s)", task_id, len(slides), s3_key)
    return {
        "task_id": task_id,
        "slides": slides_data,
        "s3_key": s3_key,
        "instructor_id": instructor_id,
        "lecture_id": lecture_id,
    }


@celery.task(base=PipelineTask, bind=True, max_retries=2, default_retry_delay=30)
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
    except Exception as exc:
        db.rollback()
        logger.error("Step2 임베딩 실패: task_id=%s, error=%s", task_id, exc)
        raise self.retry(exc=exc)
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
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(
                notify_instructor(
                    instructor_id=uuid.UUID(instructor_id),
                    lecture_id=uuid.UUID(lecture_id),
                    status="PENDING_REVIEW",
                )
            )
            loop.close()
        except Exception as exc:
            # 알림 실패는 파이프라인을 중단시키지 않음
            logger.warning("Step5 알림 전송 실패 (무시): task_id=%s, error=%s", task_id, exc)

    logger.info("Step5 완료: task_id=%s, 알림 전송", task_id)
    return prev_result


def start_pipeline(task_id: str, s3_key: str, instructor_id: str | None = None, lecture_id: str | None = None):
    """5단계 Celery 체인 파이프라인을 시작. s3_key: S3에 업로드된 PPT 파일 키."""
    pipeline = chain(
        step1_parse.s(task_id, s3_key, instructor_id, lecture_id),
        step2_embed.s(),
        step3_generate_scripts.s(),
        step4_mark_pending_review.s(),
        step5_notify.s(),
    )
    return pipeline.apply_async()
