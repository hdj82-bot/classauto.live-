"""PPT 파이프라인 Celery 태스크 — 5단계 체인.

1. PPT 파싱 → Slide 저장
2. 임베딩 생성 → Embedding 저장
3. Claude API 스크립트 생성 → Script 저장
4. Video.status = PENDING_REVIEW 업데이트
5. 교수자에게 "스크립트 검토 준비됨" 알림
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from celery import chain, Task
from sqlalchemy.orm import Session

from app.celery_app import celery
from app.database import SessionLocal
from app.models.embedding import SlideEmbedding
from app.models.schemas import SlideContent
from app.models.video import Script, Slide, Video, VideoStatus
from app.services.embedding import get_embeddings
from app.services.notification import notify_script_ready
from app.services.parser import parse_pptx
from app.services.script_generator import generate_scripts

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _get_db() -> Session:
    return SessionLocal()


def _update_video_status(
    db: Session, task_id: str, status: VideoStatus, error: str | None = None
) -> Video:
    video = db.query(Video).filter(Video.task_id == task_id).one()
    video.status = status
    if error:
        video.error_message = error
    db.commit()
    db.refresh(video)
    return video


# ---------------------------------------------------------------------------
# 태스크 베이스
# ---------------------------------------------------------------------------

class PipelineTask(Task):
    """실패 시 Video.status = FAILED 로 업데이트."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("태스크 %s 실패: %s", task_id, exc)
        # args[0] 은 항상 task_id (pipeline_task_id)
        pipeline_task_id = args[0] if args else None
        if pipeline_task_id:
            db = _get_db()
            try:
                _update_video_status(db, pipeline_task_id, VideoStatus.FAILED, str(exc))
            except Exception:
                logger.exception("FAILED 상태 업데이트 실패")
            finally:
                db.close()


# ---------------------------------------------------------------------------
# Step 1: PPT 파싱 → Slide 저장
# ---------------------------------------------------------------------------

@celery.task(bind=True, base=PipelineTask, name="pipeline.step1_parse")
def step1_parse(self, task_id: str, file_path: str, output_dir: str) -> dict:
    """PPTX를 파싱하고 Slide 레코드를 DB에 저장한다."""
    logger.info("[Step 1] 파싱 시작 — task_id=%s", task_id)

    db = _get_db()
    try:
        _update_video_status(db, task_id, VideoStatus.PARSING)

        # 파싱
        parsed_slides = parse_pptx(file_path, output_dir)

        # DB 저장
        video = db.query(Video).filter(Video.task_id == task_id).one()
        video.total_slides = len(parsed_slides)

        slide_ids: list[int] = []
        for sc in parsed_slides:
            slide = Slide(
                video_id=video.id,
                slide_number=sc.slide_number,
                text_content="\n".join(sc.texts),
                speaker_notes=sc.speaker_notes,
                image_paths=json.dumps(sc.image_paths, ensure_ascii=False),
            )
            db.add(slide)
            db.flush()
            slide_ids.append(slide.id)

        db.commit()
        logger.info("[Step 1] %d개 슬라이드 저장 완료", len(slide_ids))

        # 다음 단계로 전달할 컨텍스트
        return {
            "task_id": task_id,
            "output_dir": output_dir,
            "slide_ids": slide_ids,
            "slides_data": [s.model_dump() for s in parsed_slides],
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Step 2: 임베딩 생성 → Embedding 저장
# ---------------------------------------------------------------------------

@celery.task(bind=True, base=PipelineTask, name="pipeline.step2_embed")
def step2_embed(self, prev_result: dict) -> dict:
    """슬라이드 텍스트를 임베딩하여 pgvector에 저장한다."""
    task_id = prev_result["task_id"]
    logger.info("[Step 2] 임베딩 생성 시작 — task_id=%s", task_id)

    db = _get_db()
    try:
        _update_video_status(db, task_id, VideoStatus.EMBEDDING)

        slides_data = prev_result["slides_data"]
        slide_ids = prev_result["slide_ids"]

        # 텍스트 수집
        embed_inputs: list[tuple[int, int, str]] = []  # (idx, slide_id, text)
        for i, sd in enumerate(slides_data):
            combined = sd.get("speaker_notes", "")
            texts = sd.get("texts", [])
            if texts:
                combined = f"{combined}\n{chr(10).join(texts)}".strip()
            if combined:
                embed_inputs.append((i, slide_ids[i], combined))

        if embed_inputs:
            texts = [t[2] for t in embed_inputs]
            embeddings = get_embeddings(texts)

            records = [
                SlideEmbedding(
                    task_id=task_id,
                    slide_number=slides_data[idx]["slide_number"],
                    slide_id=sid,
                    text_content=text,
                    embedding=emb,
                )
                for (idx, sid, text), emb in zip(embed_inputs, embeddings)
            ]
            db.add_all(records)
            db.commit()
            logger.info("[Step 2] %d개 임베딩 저장 완료", len(records))
        else:
            logger.info("[Step 2] 임베딩할 텍스트 없음")

        return prev_result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Step 3: Claude API 스크립트 생성 → Script 저장
# ---------------------------------------------------------------------------

@celery.task(bind=True, base=PipelineTask, name="pipeline.step3_generate_script")
def step3_generate_script(self, prev_result: dict) -> dict:
    """Claude API로 슬라이드별 발화 스크립트를 생성하고 DB에 저장한다."""
    task_id = prev_result["task_id"]
    logger.info("[Step 3] 스크립트 생성 시작 — task_id=%s", task_id)

    db = _get_db()
    try:
        _update_video_status(db, task_id, VideoStatus.GENERATING_SCRIPT)

        slides_data = prev_result["slides_data"]
        slide_ids = prev_result["slide_ids"]

        # Pydantic 모델로 변환하여 기존 서비스 활용
        slide_contents = [SlideContent(**sd) for sd in slides_data]
        scripts = generate_scripts(slide_contents)

        # DB 저장
        for slide_id, script in zip(slide_ids, scripts):
            db.add(Script(slide_id=slide_id, content=script.script))

        db.commit()
        logger.info("[Step 3] %d개 스크립트 저장 완료", len(scripts))

        # 결과 JSON 파일 저장
        output_dir = prev_result["output_dir"]
        result_path = Path(output_dir) / "result.json"
        result_data = {
            "task_id": task_id,
            "total_slides": len(slides_data),
            "scripts": [s.model_dump() for s in scripts],
        }
        result_path.write_text(
            json.dumps(result_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        return prev_result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Step 4: Video.status = PENDING_REVIEW
# ---------------------------------------------------------------------------

@celery.task(bind=True, base=PipelineTask, name="pipeline.step4_mark_review")
def step4_mark_review(self, prev_result: dict) -> dict:
    """Video 상태를 PENDING_REVIEW로 업데이트한다."""
    task_id = prev_result["task_id"]
    logger.info("[Step 4] 상태 업데이트 → PENDING_REVIEW — task_id=%s", task_id)

    db = _get_db()
    try:
        _update_video_status(db, task_id, VideoStatus.PENDING_REVIEW)
        return prev_result
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Step 5: 교수자 알림
# ---------------------------------------------------------------------------

@celery.task(bind=True, base=PipelineTask, name="pipeline.step5_notify")
def step5_notify(self, prev_result: dict) -> dict:
    """교수자에게 스크립트 검토 준비 알림을 발송한다."""
    task_id = prev_result["task_id"]
    logger.info("[Step 5] 알림 발송 — task_id=%s", task_id)

    db = _get_db()
    try:
        video = db.query(Video).filter(Video.task_id == task_id).one()
        notify_script_ready(task_id, video.filename, video.total_slides)

        logger.info("[파이프라인 완료] task_id=%s", task_id)
        return {
            "task_id": task_id,
            "status": "PENDING_REVIEW",
            "total_slides": video.total_slides,
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 파이프라인 실행 (체인)
# ---------------------------------------------------------------------------

def run_pipeline(task_id: str, file_path: str, output_dir: str):
    """5단계 Celery 체인을 실행한다."""
    pipeline = chain(
        step1_parse.s(task_id, file_path, output_dir),
        step2_embed.s(),
        step3_generate_script.s(),
        step4_mark_review.s(),
        step5_notify.s(),
    )
    pipeline.apply_async(task_id=task_id)
