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


def _audio_s3_key(render_id: str, ext: str = "mp3") -> str:
    """upload_audio_bytes 가 사용하는 S3 키와 동일한 규칙."""
    from app.core.config import settings
    return f"{settings.S3_PREFIX}audio/{render_id}.{ext}"


@celery.task(bind=True, max_retries=2, default_retry_delay=30)
def render_slide(
    self,
    render_id: str,
    script_text: str,
    caller_user_id: str | None = None,
) -> dict:
    """TTS 합성 → S3 업로드 → HeyGen 비디오 생성 요청.

    Critical 7: 호출자(caller_user_id) 가 VideoRender.instructor_id 와 다르면 즉시 종료.
    Critical 8: 각 단계는 산출물 존재 여부로 idempotent — 재시도/중복 enqueue 시 skip.
    """
    import asyncio
    from app.models.lecture import Lecture, VoiceGender
    from app.models.user import User
    from app.services.pipeline.tts import synthesize
    from app.services.pipeline.heygen import create_video
    from app.services.pipeline.budget import assert_heygen_budget, BudgetExceededError
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
        # voice_speed 컬럼이 없는 구버전 row 대비 getattr 로 안전 접근.
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
        # 영상 아바타 크기 배율. NULL/누락(구버전 row)/0 은 기본(1.0)로 폴백.
        avatar_scale = (
            getattr(lecture, "avatar_scale", None) if lecture else None
        ) or 1.0

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

        # ── Critical 8: 이미 HeyGen 까지 완료된 경우 전체 skip ──
        if render.heygen_job_id:
            logger.info(
                "render_slide idempotent skip — 이미 HeyGen 제출됨: "
                "render_id=%s, heygen_job_id=%s",
                render_id, render.heygen_job_id,
            )
            return {"render_id": render_id, "heygen_job_id": render.heygen_job_id, "skipped": True}

        # ── 예산 서킷 브레이커 ──
        # 누적 HeyGen 비용이 일/월 한도를 넘으면 TTS·HeyGen 호출 전에 즉시 차단해
        # 비용 낭비를 막는다. mock 모드는 budget 모듈이 자체적으로 통과시킨다.
        assert_heygen_budget(db)

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
            # 이후 S3 업로드(또는 HeyGen 단계)가 실패해 메인 트랜잭션이 rollback 돼도
            # 이미 발생한 provider 비용은 회계에 반드시 남아야 한다.
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
            db.commit()
        else:
            logger.info(
                "TTS idempotent skip — audio_url 및 S3 객체 존재: render_id=%s, key=%s",
                render_id, s3_audio_key,
            )

        # ── Critical 8: HeyGen 단계 idempotency ──
        if render.heygen_job_id:
            logger.info(
                "HeyGen idempotent skip — heygen_job_id 이미 존재: render_id=%s",
                render_id,
            )
            return {"render_id": render_id, "heygen_job_id": render.heygen_job_id, "skipped": True}

        if render.status != RenderStatus.rendering:
            render.status = RenderStatus.rendering
            db.commit()

        # HeyGen 이 audio_url 을 직접 다운로드하므로 익명 접근이 가능해야 한다.
        # 운영 버킷(classauto-live-media)은 thumbnails/* 외 prefix 에 public-read 를
        # 주지 않아, upload_audio_bytes 가 돌려준 영구 URL(audio/*)은 익명 GET 시
        # 403 → HeyGen 이 제출은 받아들이지만(=video_id 발급) 다운로드 단계에서
        # 실패해 video 가 Error 로 끝난다. presigned(서명·시간제한) URL 로 바꿔
        # 전달한다. DB(render.audio_url)에는 영구 URL 을 그대로 둔다(idempotency·
        # file_exists 는 S3 key 로 판단하므로 영향 없음). 만료는 렌더 타임아웃
        # (RENDER_TIMEOUT_HOURS=24h)을 덮도록 24h.
        heygen_audio_url = s3_svc.presign_stored_s3_url(audio_url, expiration=86400)

        heygen_job_id = loop.run_until_complete(
            create_video(
                audio_url=heygen_audio_url,
                avatar_id=render.avatar_id,
                gender=voice_gender,
                callback_id=str(render.id),
                avatar_scale=avatar_scale,
            )
        )

        # H: HeyGen 제출 성공 직후 비용을 별도 트랜잭션으로 즉시 commit —
        # heygen_job_id 를 메인 세션에 쓰는 것이 후속 예외로 rollback 되어도 비용은 남는다.
        cost_log.record_once_committed(
            SyncSessionLocal,
            render.id,
            service="heygen",
            operation="heygen_submit",
            cost_usd=0.0,
        )

        render.heygen_job_id = heygen_job_id
        db.commit()

        logger.info("렌더 파이프라인 시작 완료: render_id=%s, heygen_job_id=%s", render_id, heygen_job_id)
        return {"render_id": render_id, "heygen_job_id": heygen_job_id}

    except BudgetExceededError as exc:
        # 예산 초과는 재시도해도 해소되지 않으므로 retry 없이 즉시 실패 처리.
        db.rollback()
        lecture_id = None
        try:
            render = db.query(VideoRender).filter(VideoRender.id == uuid.UUID(render_id)).one()
            render.status = RenderStatus.failed
            render.error_message = f"예산 한도 초과로 렌더 차단: {exc}"
            lecture_id = render.lecture_id
            db.commit()
        except Exception:
            db.rollback()
        if lecture_id:
            _archive_videos_for_lecture(lecture_id)
        logger.error("렌더 예산 차단: render_id=%s, error=%s", render_id, exc)
        return {"render_id": render_id, "status": "BUDGET_EXCEEDED"}

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
