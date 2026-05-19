"""5단계 PPT→임베딩→스크립트→검토대기→알림 Celery 파이프라인."""
from __future__ import annotations

import logging
import os
import shutil
import uuid

from celery import chain

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.services.pipeline.schemas import SlideContent

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")


def _revert_videos_to_draft(lecture_id: str) -> None:
    """파이프라인 실패 시 해당 강의의 pending_review Video를 draft로 롤백."""
    from sqlalchemy import select
    from app.models.video import Video, VideoStatus

    db = SyncSessionLocal()
    try:
        videos = db.execute(
            select(Video).where(
                Video.lecture_id == uuid.UUID(lecture_id),
                Video.status == VideoStatus.pending_review,
            )
        ).scalars().all()
        for video in videos:
            video.status = VideoStatus.draft
        if videos:
            db.commit()
            logger.warning(
                "파이프라인 실패로 Video %d개를 draft로 롤백: lecture_id=%s",
                len(videos), lecture_id,
            )
    except Exception as db_exc:
        db.rollback()
        logger.error("Video 롤백 실패: lecture_id=%s, error=%s", lecture_id, db_exc)
    finally:
        db.close()


class PipelineTask(celery.Task):
    """파이프라인 공통 베이스 — 실패 시 Video 상태를 draft로 롤백."""
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        # args[0]이 dict이면 steps 2-5 (prev_result 전달), str이면 step1 (pipeline_task_id)
        pipeline_task_id = None
        lecture_id = None
        if args:
            first = args[0]
            if isinstance(first, dict):
                pipeline_task_id = first.get("task_id")
                lecture_id = first.get("lecture_id")
            elif isinstance(first, str):
                pipeline_task_id = first
                lecture_id = kwargs.get("lecture_id")
        logger.error(
            "파이프라인 태스크 실패: celery_task_id=%s, pipeline_task_id=%s, lecture_id=%s, error=%s",
            task_id, pipeline_task_id, lecture_id, exc,
        )
        if lecture_id:
            _revert_videos_to_draft(lecture_id)


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

    # High F: tmp_dir 은 try/finally 로 감싸 shutil.rmtree(ignore_errors=True).
    # retry 케이스(예: S3 다운로드 실패)는 위쪽에서 self.retry 가 발생하여 tmp_dir 가
    # 만들어지기 전에 종료되므로 자연스럽게 보존된다.
    tmp_dir = os.path.join(UPLOAD_DIR, task_id)
    os.makedirs(tmp_dir, exist_ok=True)
    try:
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
    finally:
        # 최종 실패/성공 모두 tmp_dir 정리 — 디스크 누수 방지.
        # script_generator 는 이미지 누락을 graceful 하게 skip 하므로 안전.
        shutil.rmtree(tmp_dir, ignore_errors=True)


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


def _estimate_segments(scripts: list[dict]) -> list[dict]:
    """step3 scripts([{slide_number, script}]) → VideoScript.segments(JSONB).

    script_generator 는 발화 텍스트만 만들고 슬라이드 길이를 산출하지 않으므로,
    한국어 발화 ≈ 5자/초(분당 ~300자) 기준으로 슬라이드별 길이를 추정해 누적
    start/end 초를 채운다. 슬라이드 최소 5초. 교수자가 스크립트 편집기에서
    조정 가능 (사용자 결정 2026-05-19: 텍스트 길이 추정).

    slide_index 는 0-based — 파서 slide_number 가 1-based(enumerate start=1)라
    slide_number - 1 로 매핑한다.
    """
    chars_per_sec = 5
    min_sec = 5
    segments: list[dict] = []
    cursor = 0
    for s in sorted(scripts, key=lambda x: x["slide_number"]):
        text = (s.get("script") or "").strip()
        slide_number = int(s["slide_number"])
        duration = max(min_sec, round(len(text) / chars_per_sec))
        start = cursor
        end = cursor + duration
        cursor = end
        segments.append(
            {
                "slide_index": max(0, slide_number - 1),
                "text": text,
                "start_seconds": start,
                "end_seconds": end,
                "tone": "normal",
                "question_pin_seconds": None,
            }
        )
    return segments


@celery.task(base=PipelineTask, bind=True, max_retries=2, default_retry_delay=30)
def step4_mark_pending_review(self, prev_result: dict) -> dict:
    """Step 4: 생성된 스크립트를 Video+VideoScript 로 영속화 → PENDING_REVIEW.

    종전 구현은 in-memory dict 만 갱신해 DB 에 아무것도 쓰지 않았다. 그 결과
    videos / video_scripts row 가 절대 생성되지 않아 studio 페이지가 모든
    강의에서 빈 스크립트(把자문 데모 폴백)를 보였다. 본 단계에서 lecture 당
    Video 1개를 get-or-create 하고 segments/ai_segments 를 채운다.
    Celery 재시도 멱등 — 이미 있으면 덮어쓴다.
    """
    from sqlalchemy import select

    from app.models.video import Video, VideoScript, VideoStatus

    task_id = prev_result["task_id"]
    lecture_id = prev_result.get("lecture_id")
    scripts = prev_result.get("scripts") or []

    if not lecture_id:
        logger.error("Step4: lecture_id 누락 — 영속화 불가: task_id=%s", task_id)
        raise RuntimeError(f"Step4 lecture_id 누락: task_id={task_id}")

    segments = _estimate_segments(scripts)
    lecture_uuid = uuid.UUID(lecture_id)

    db = SyncSessionLocal()
    try:
        video = (
            db.execute(select(Video).where(Video.lecture_id == lecture_uuid))
            .scalars()
            .first()
        )
        if video is None:
            video = Video(
                lecture_id=lecture_uuid, status=VideoStatus.pending_review
            )
            db.add(video)
            db.flush()  # video.id 확보 (VideoScript FK)
        else:
            video.status = VideoStatus.pending_review

        script_row = (
            db.execute(select(VideoScript).where(VideoScript.video_id == video.id))
            .scalars()
            .first()
        )
        if script_row is None:
            script_row = VideoScript(
                video_id=video.id, segments=segments, ai_segments=segments
            )
            db.add(script_row)
        else:
            # 재시도/재생성 — 최종본과 AI 원본 모두 갱신
            script_row.segments = segments
            script_row.ai_segments = segments

        video_id = str(video.id)
        db.commit()
        logger.info(
            "Step4 완료: task_id=%s, video_id=%s, %d segment 영속화 → PENDING_REVIEW",
            task_id,
            video_id,
            len(segments),
        )
    except Exception as exc:
        db.rollback()
        logger.error("Step4 영속화 실패: task_id=%s, error=%s", task_id, exc)
        raise self.retry(exc=exc)
    finally:
        db.close()

    return {**prev_result, "status": "PENDING_REVIEW", "video_id": video_id}


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
        step1_parse.s(task_id, s3_key, instructor_id=instructor_id, lecture_id=lecture_id),
        step2_embed.s(),
        step3_generate_scripts.s(),
        step4_mark_pending_review.s(),
        step5_notify.s(),
    )
    return pipeline.apply_async()
