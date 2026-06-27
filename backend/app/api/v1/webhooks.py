"""HeyGen 웹훅 API (app/api/webhooks.py 흡수)."""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.lecture import Lecture
from app.models.video_render import RenderStatus, VideoRender, WebhookEventLog
from app.services.pipeline import cost_log, notification, s3 as s3_svc
from app.services.pipeline.heygen import estimate_cost_usd
from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

VALID_EVENT_TYPES = {"avatar_video.success", "avatar_video.fail"}
_HEYGEN_PROVIDER = "heygen"


@router.post("/heygen", summary="HeyGen 렌더링 웹훅")
async def heygen_webhook(
    request: Request,
    signature: str | None = Header(None),
    x_heygen_signature: str | None = Header(None),
):
    body = await request.body()

    # 서명 검증 — 모든 환경에서 강제(fail-closed).
    #
    # 시크릿이 없으면 위조 웹훅(임의 외부 영상 주입 등)을 막을 수 없으므로,
    # 경고 후 통과시키지 않고 401 로 거부한다(개발환경 포함). 운영 시 반드시
    # HEYGEN_WEBHOOK_SECRET 를 설정해야 웹훅이 동작한다.
    secret = settings.HEYGEN_WEBHOOK_SECRET
    if not secret:
        logger.error("HEYGEN_WEBHOOK_SECRET 미설정 — 웹훅 거부(fail-closed)")
        raise HTTPException(status_code=401, detail="Webhook secret not configured")

    # HeyGen 은 raw request body 의 HMAC-SHA256 hex digest 를 'Signature' 헤더로
    # 보낸다(prefix·timestamp 없는 raw hex). 구버전/프록시 호환을 위해
    # 'X-HeyGen-Signature' 도 함께 받고, 일부 게이트웨이가 붙이는 'sha256=' 접두사는
    # 제거한 뒤 대소문자 무시로 상수시간 비교한다.
    provided = signature or x_heygen_signature
    if not provided:
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    provided = provided.strip()
    if provided.lower().startswith("sha256="):
        provided = provided[len("sha256="):]
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, provided.lower()):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()
    event_type = payload.get("event_type", "")
    event_data = payload.get("event_data", {})
    video_id = event_data.get("video_id")

    if not video_id:
        return {"status": "ignored", "reason": "no video_id"}

    if event_type not in VALID_EVENT_TYPES:
        logger.info("무시된 웹훅 이벤트: type=%s, video_id=%s", event_type, video_id)
        return {"status": "ignored", "reason": f"unhandled event_type: {event_type}"}

    db = SyncSessionLocal()
    try:
        # 멱등성 1단계: WebhookEventLog UNIQUE(provider, external_id, event_type)로
        # 동일 이벤트의 중복 처리를 차단. INSERT가 실패하면 이미 수신/처리된 이벤트.
        log = WebhookEventLog(
            provider=_HEYGEN_PROVIDER,
            external_id=video_id,
            event_type=event_type,
        )
        db.add(log)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            logger.info(
                "중복 HeyGen 웹훅 무시: job_id=%s, event_type=%s", video_id, event_type
            )
            return {"status": "duplicate", "video_id": video_id, "event_type": event_type}

        result = db.execute(
            select(VideoRender).where(VideoRender.heygen_job_id == video_id)
        )
        render = result.scalar_one_or_none()
        if not render:
            # 슬라이드(VideoRender)가 아니면 사전 질문(Q&A 아바타) 클립일 수 있다.
            # 슬라이드와 달리 seed 클립은 웹훅이 없어 폴링 한도(10분) 후 'rendering'
            # 으로 고착됐다. 같은 웹훅으로 seed 도 완료 처리한다.
            seed_result = await _handle_seed_clip_webhook(
                db, video_id, event_type, event_data
            )
            if seed_result is not None:
                db.commit()
                return seed_result
            logger.warning("HeyGen 웹훅: 매칭되는 render 없음 job_id=%s, event_type=%s", video_id, event_type)
            db.commit()
            return {"status": "ignored", "reason": "unknown video_id"}

        # 멱등성 2단계: 이미 done/failed 상태인데 success가 다시 와도 200 + 무시.
        # (이벤트 로그는 위에서 이미 첫 수신을 막지만, 재발급 시 안전망으로 유지)
        if render.status in (RenderStatus.ready, RenderStatus.failed):
            logger.info(
                "이미 처리된 렌더에 대한 %s 이벤트 무시: render_id=%s, status=%s",
                event_type, render.id, render.status,
            )
            db.commit()
            return {"status": "already_processed", "render_id": str(render.id)}

        logger.info("HeyGen 웹훅 수신: job_id=%s, render_id=%s, event_type=%s", video_id, render.id, event_type)

        if event_type == "avatar_video.success":
            heygen_url = event_data.get("url", "")
            if heygen_url:
                try:
                    s3_url, elapsed = await s3_svc.upload_from_url(
                        heygen_url, str(render.lecture_id), render.slide_number,
                        allowed_hosts=s3_svc.HEYGEN_ALLOWED_HOSTS,
                    )
                    render.s3_video_url = s3_url
                    render.heygen_video_url = heygen_url
                except Exception as exc:
                    logger.error("S3 업로드 실패: render_id=%s, error=%s", render.id, exc)
                    render.status = RenderStatus.failed
                    render.error_message = f"S3 업로드 실패: {exc}"
                    db.commit()
                    return {"status": "error", "reason": "s3_upload_failed"}

            render.status = RenderStatus.ready
            render.completed_at = datetime.now(timezone.utc)

            # record_once: 폴링 폴백과의 race / 웹훅 재발급 시 (video_render_id, operation)
            # UNIQUE 인덱스로 중복 비용 기록 방지. WebhookEventLog UNIQUE 가 1차 방어,
            # 이건 2차 안전망 — 두 경로(웹훅/폴링)가 같은 render 에 도달해도 1회만 기록.
            duration = event_data.get("duration")
            cost_log.record_once(db, render.id, "heygen", "video_render",
                                 cost_usd=estimate_cost_usd(duration),
                                 duration_seconds=duration)

            # 첫 번째 슬라이드(slide_number=0 또는 1)인 경우 강의 썸네일 자동 생성
            video_url_for_thumb = render.s3_video_url or render.heygen_video_url
            if render.slide_number in (0, 1) and video_url_for_thumb:
                try:
                    thumb_url = await generate_thumbnail_from_video_url(
                        video_url_for_thumb, str(render.lecture_id)
                    )
                    if thumb_url:
                        lecture = db.query(Lecture).filter(Lecture.id == render.lecture_id).first()
                        if lecture and not lecture.thumbnail_url:
                            lecture.thumbnail_url = thumb_url
                except Exception as exc:
                    logger.warning("썸네일 생성 실패 (무시): render_id=%s, error=%s", render.id, exc)

            db.commit()

            # 강의의 모든 본문 렌더가 끝났으면 Video 를 done 으로 전환(rendering 고착 방지).
            try:
                from app.services.video_status import finalize_video_if_all_ready
                finalize_video_if_all_ready(db, render.lecture_id)
            except Exception as exc:
                logger.warning(
                    "Video done 전환 실패 (무시): lecture_id=%s, error=%s",
                    render.lecture_id, exc,
                )

            try:
                await notification.notify_instructor(
                    render.instructor_id, render.lecture_id, "READY", render.s3_video_url
                )
            except Exception as exc:
                logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

        elif event_type == "avatar_video.fail":
            render.status = RenderStatus.failed
            render.error_message = event_data.get("error", "HeyGen rendering failed")
            db.commit()

            try:
                await notification.notify_instructor(
                    render.instructor_id, render.lecture_id, "FAILED",
                    error_message=render.error_message,
                )
            except Exception as exc:
                logger.warning("알림 전송 실패 (무시): render_id=%s, error=%s", render.id, exc)

        return {"status": "processed", "render_id": str(render.id)}
    finally:
        db.close()


async def _handle_seed_clip_webhook(
    db, video_id: str, event_type: str, event_data: dict
) -> dict | None:
    """사전 질문(Q&A 아바타) 클립 완료를 웹훅으로 처리한다.

    ``QAAnswerCache.heygen_job_id == video_id`` 로 매칭. 매칭이 없으면 None 을 돌려
    호출부가 "unknown video_id" 로 흘려보낸다(= 이 웹훅은 seed 가 아님).

    성공: HeyGen url 을 S3 로 올린 뒤 ready 로 전이(폴링 경로 _mark_cluster_ready 와
    동일 상태). 실패/URL 없음: failed. 비용 기록은 기존 폴링 완료 경로(_poll_inflight)
    와 동일하게 생략한다. 멱등성은 호출부의 WebhookEventLog + 여기 종료상태 가드로 보장.
    """
    from app.models.qa_answer_cache import QAAnswerCache
    from app.services.pipeline import qa_avatar
    from app.tasks.qa_batch import _mark_cluster_failed, _mark_cluster_ready

    rep = db.execute(
        select(QAAnswerCache).where(QAAnswerCache.heygen_job_id == video_id)
    ).scalar_one_or_none()
    if rep is None:
        return None

    if rep.status in (qa_avatar.STATUS_READY, qa_avatar.STATUS_FAILED):
        logger.info(
            "이미 처리된 Q&A 클립에 대한 %s 이벤트 무시: seed_id=%s, status=%s",
            event_type, rep.id, rep.status,
        )
        return {"status": "already_processed", "seed_id": str(rep.id)}

    logger.info(
        "HeyGen 웹훅 수신(Q&A 클립): job_id=%s, seed_id=%s, event_type=%s",
        video_id, rep.id, event_type,
    )

    if event_type == "avatar_video.success":
        heygen_url = event_data.get("url", "")
        duration = event_data.get("duration")
        s3_url = None
        if heygen_url:
            try:
                s3_url, _ = await s3_svc.upload_from_url(
                    heygen_url, str(rep.lecture_id),
                    allowed_hosts=s3_svc.HEYGEN_ALLOWED_HOSTS,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Q&A 클립 S3 업로드 실패: seed_id=%s, error=%s", rep.id, exc)
                _mark_cluster_failed(db, rep.cluster_key, f"S3 업로드 실패: {exc}")
                return {"status": "error", "reason": "s3_upload_failed"}
        if not s3_url:
            _mark_cluster_failed(db, rep.cluster_key, "HeyGen 응답에 영상 URL 이 없습니다.")
            return {"status": "error", "reason": "no_video_url"}
        _mark_cluster_ready(db, rep, s3_url, duration)
        return {"status": "processed", "seed_id": str(rep.id)}

    # avatar_video.fail
    _mark_cluster_failed(
        db, rep.cluster_key, event_data.get("error", "HeyGen Q&A 렌더 실패")
    )
    return {"status": "processed", "seed_id": str(rep.id)}
