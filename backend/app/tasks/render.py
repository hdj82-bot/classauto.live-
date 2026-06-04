"""단일 슬라이드 렌더링 태스크: TTS → S3 (HeyGen 제거 — 본문은 TTS만).

본문 영상은 더 이상 슬라이드별 HeyGen 아바타 영상을 굽지 않는다
(docs/planning/08-cost-optimization.md Phase 1). 각 세그먼트는 TTS 오디오만
합성·업로드하고, 학생 플레이어가 "슬라이드 PNG + 구간 TTS + 타임라인"
(GET /api/lectures/{id}/play)으로 재생한다. HeyGen 은 Q&A 캐시 답변 전용(창2).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

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


def _audio_s3_key(render_id: str, ext: str = "mp3") -> str:
    """upload_audio_bytes 가 사용하는 S3 키와 동일한 규칙."""
    from app.core.config import settings
    return f"{settings.S3_PREFIX}audio/{render_id}.{ext}"


def _finalize_video_if_all_ready(db, lecture_id: uuid.UUID) -> bool:
    """강의의 모든 VideoRender 가 ready 면 최신 rendering Video 를 done 으로 전환.

    본문 완료는 슬라이드별 HeyGen 웹훅이 아니라 마지막 TTS 렌더가 끝나는 시점에
    이 헬퍼로 판정한다. 동시에 끝난 두 태스크가 모두 done 으로 만들어도 멱등.
    반환: 이번 호출로 Video 를 done 으로 전환했으면 True(완료 알림 트리거용).
    """
    from app.models.video import Video, VideoStatus

    pending = (
        db.query(VideoRender)
        .filter(
            VideoRender.lecture_id == lecture_id,
            VideoRender.status.notin_([RenderStatus.ready, RenderStatus.cancelled]),
        )
        .count()
    )
    if pending:
        return False

    videos = (
        db.query(Video)
        .filter(Video.lecture_id == lecture_id, Video.status == VideoStatus.rendering)
        .all()
    )
    for video in videos:
        video.status = VideoStatus.done
    if videos:
        db.commit()
        return True
    return False


@celery.task(bind=True, max_retries=2, default_retry_delay=30)
def render_slide(
    self,
    render_id: str,
    script_text: str,
    caller_user_id: str | None = None,
) -> dict:
    """TTS 합성 → S3 업로드. (HeyGen 호출 없음 — 본문은 TTS만.)

    Critical 7: 호출자(caller_user_id) 가 VideoRender.instructor_id 와 다르면 즉시 종료.
    Critical 8: audio_url 과 S3 객체가 모두 있으면 TTS 호출 skip — 재시도/중복 enqueue 시.
    """
    import asyncio
    from app.models.lecture import Lecture, VoiceGender
    from app.models.user import User
    from app.services.pipeline.tts import synthesize
    from app.services.cost_tracker import estimate_tts_cost_usd

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()

        # 강의 단위 voice_gender 를 한 번만 조회. lecture 가 사라졌거나 컬럼이 NULL 인
        # 엣지 케이스(0016 마이그레이션 전 row 등) 는 'male' 로 안전하게 fallback.
        lecture = db.query(Lecture).filter(Lecture.id == render.lecture_id).first()
        voice_gender = (
            lecture.voice_gender.value
            if lecture and isinstance(lecture.voice_gender, VoiceGender)
            else (str(lecture.voice_gender) if lecture and lecture.voice_gender else "male")
        )
        # 교수자가 고른 보이스·속도. NULL/누락이면 기본(성별 보이스 / 1.3배속).
        voice_id = (lecture.voice_id or None) if lecture else None
        # 교수자가 고른 보이스가 본인 목소리(IVC 클론)면 cloned 경로로 합성한다
        # (v3 대신 multilingual_v2 + 클론 튜닝 — avatars/voices 미리듣기와 동일 규칙).
        professor = (
            db.query(User).filter(User.id == render.instructor_id).first()
        )
        is_cloned_voice = bool(
            voice_id
            and professor
            and professor.cloned_voice_id
            and voice_id == professor.cloned_voice_id
        )
        voice_speed = (
            getattr(lecture, "voice_speed", None) if lecture else None
        ) or 1.3

        # ── Critical 7: 호출자 소유권 검증 ──
        if caller_user_id is not None:
            if str(render.instructor_id) != str(caller_user_id):
                logger.warning(
                    "[security] render_slide 소유권 불일치 — 태스크 즉시 종료: "
                    "render_id=%s, render.instructor_id=%s, caller=%s, celery_task_id=%s",
                    render_id, render.instructor_id, caller_user_id, self.request.id,
                )
                # retry 하지 않고 종료 — Celery 가 결과를 성공으로 기록(반복 enqueue 방지)
                return {"render_id": render_id, "status": "REJECTED_OWNERSHIP_MISMATCH"}

        # ── Critical 8: 이미 ready 면 전체 skip ──
        if render.status == RenderStatus.ready and render.audio_url:
            logger.info("render_slide idempotent skip — 이미 ready: render_id=%s", render_id)
            return {"render_id": render_id, "status": "ready", "skipped": True}

        # 단계 진입 시점에만 상태 갱신 — 이미 진행 단계 이후면 덮어쓰지 않음
        if render.status in (RenderStatus.pending,):
            render.status = RenderStatus.tts_processing
            db.commit()

        # ── Critical 8: TTS 단계 idempotency ──
        # 이미 audio_url 이 있고 S3 객체도 존재하면 TTS 호출 skip
        audio_url = render.audio_url
        s3_audio_key = _audio_s3_key(render_id)
        tts_already_done = bool(audio_url) and s3_svc.file_exists(s3_audio_key)

        if not tts_already_done:
            tts_result = loop.run_until_complete(
                synthesize(
                    script_text,
                    voice_id=voice_id,
                    gender=voice_gender,
                    speed=voice_speed,
                    cloned=is_cloned_voice,
                )
            )

            # H: TTS API 성공 직후 별도 트랜잭션으로 비용을 즉시 commit.
            # 이후 S3 업로드가 실패해 메인 트랜잭션이 rollback 돼도 이미 발생한
            # provider 비용은 회계에 반드시 남아야 한다.
            tts_cost = estimate_tts_cost_usd(tts_result.provider, len(script_text))
            cost_log.record_once_committed(
                SyncSessionLocal,
                render.id,
                service=tts_result.provider,
                operation="tts_synthesize",
                cost_usd=tts_cost,
                duration_seconds=tts_result.duration_seconds,
            )

            audio_url = s3_svc.upload_audio_bytes(tts_result.audio_bytes, str(render.id))
            render.audio_url = audio_url
            render.tts_provider = tts_result.provider
        else:
            logger.info(
                "TTS idempotent skip — audio_url 및 S3 객체 존재: render_id=%s, key=%s",
                render_id, s3_audio_key,
            )

        # 본문은 HeyGen 을 호출하지 않는다 — TTS 완료 = 렌더 완료(ready).
        render.status = RenderStatus.ready
        render.completed_at = datetime.now(tz=timezone.utc)
        db.commit()

        # 강의의 모든 슬라이드 TTS 가 끝났으면 Video 를 done 으로 전환하고 1회 알림.
        try:
            flipped = _finalize_video_if_all_ready(db, render.lecture_id)
        except Exception as exc:
            db.rollback()
            flipped = False
            logger.warning(
                "Video done 전환 실패(무시): lecture_id=%s, error=%s", render.lecture_id, exc
            )
        if flipped:
            try:
                from app.services.pipeline import notification
                loop.run_until_complete(
                    notification.notify_instructor(
                        render.instructor_id, render.lecture_id, "READY", None
                    )
                )
            except Exception as exc:
                logger.warning(
                    "완료 알림 전송 실패(무시): lecture_id=%s, error=%s", render.lecture_id, exc
                )

        logger.info("본문 TTS 렌더 완료: render_id=%s", render_id)
        return {"render_id": render_id, "status": "ready", "audio_url": audio_url}

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
            "본문 TTS 렌더 실패: render_id=%s, retries=%d/%d, error=%s",
            render_id, self.request.retries, self.max_retries, exc,
        )
        raise self.retry(exc=exc)
    finally:
        loop.close()
        db.close()
