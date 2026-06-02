"""Photo Avatar(Design with AI) 비동기 폴링 태스크.

HeyGen 그룹 학습·룩 생성은 비동기라 generation/group 상태를 폴링해야 한다.
기존 poll_pending_renders 패턴(SyncSessionLocal + run_until_complete + 재시도)을 따른다.
HEYGEN_MOCK 일 때 클라이언트가 즉시 ready 를 반환하므로 외부 호출 없이 완료된다.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy import update

from app.celery_app import celery
from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.photo_avatar import LookStatus, PhotoAvatarLook
from app.models.user import User

logger = logging.getLogger(__name__)

# 폴링 상한: 10초 간격 × 90회 ≈ 15분. 학습·룩 생성이 그 안에 끝난다는 전제.
_MAX_RETRIES = 90
_RETRY_DELAY = 10


def _look_not_ready(exc: Exception) -> bool:
    """train 실패가 '업로드 사진(look)이 아직 처리 중' 때문인지(= 기다리면 해소).

    그룹 생성 직후 사진은 'pending' 이라 곧바로 train 하면 HeyGen 이
    400 invalid_parameter "No valid image for training found in group" 를 낸다.
    이 경우만 재시도로 흡수하고, 다른 오류는 실패로 처리한다.
    """
    s = str(exc).lower()
    return (
        "no valid image" in s
        or "not completed" in s
        or "not ready" in s
        or "pending" in s
    )


def _classify_failure(exc: Exception) -> str:
    """학습 실패 사유를 사용자 안내용 분류 코드로 변환.

    - ``insufficient_credit``: HeyGen API 크레딧 부족 — 사진이 아니라 결제 문제.
      (예: ``{"code":"insufficient_credit","message":"... requires 'api' credits"}``)
    - ``invalid_image``: 사진 자체 문제(얼굴 미검출·화질 등) — 다른 사진 권장.
    - ``unknown``: 그 외.
    호출 시점은 이미 _look_not_ready(=재시도 대상)를 걸러낸 '최종 실패' 경로다.
    """
    s = str(exc).lower()
    if "insufficient_credit" in s or "insufficient credit" in s or "requires 'api' credit" in s:
        return "insufficient_credit"
    if "face" in s or "image" in s or "photo" in s or "resolution" in s:
        return "invalid_image"
    return "unknown"


@celery.task(bind=True, max_retries=_MAX_RETRIES, default_retry_delay=_RETRY_DELAY)
def prepare_photo_avatar_training(self, user_id: str) -> dict:
    """업로드 사진이 ready 될 때까지 기다렸다가 학습(train)을 시작한다.

    그룹 생성 직후 사진(look)은 'pending' 이므로 즉시 train 하면 실패한다
    (HeyGen "No valid image for training"). 그 경우 self.retry 로 잠시 기다렸다
    다시 train 하고, 성공하면 poll_photo_avatar_training 으로 학습 상태 폴링을 잇는다.
    """
    from app.services.pipeline.heygen import HeyGenError, train_photo_avatar_group

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).one()
        group_id = user.photo_avatar_group_id
        if not group_id:
            return {"user_id": user_id, "status": "none"}

        try:
            loop.run_until_complete(train_photo_avatar_group(group_id))
        except HeyGenError as exc:
            if _look_not_ready(exc):
                logger.info(
                    "Photo Avatar 사진 준비 대기 후 train 재시도: user=%s (%s)",
                    user_id, exc,
                )
                raise self.retry(exc=exc)
            reason = _classify_failure(exc)
            logger.warning(
                "Photo Avatar 학습 시작 실패: user=%s, reason=%s, error=%s",
                user_id, reason, exc,
            )
            user.photo_avatar_group_status = "failed"
            user.photo_avatar_group_error = reason
            db.commit()
            return {"user_id": user_id, "status": "failed", "reason": reason}

        logger.info("Photo Avatar 학습 시작됨: user=%s, group=%s", user_id, group_id)
    finally:
        loop.close()
        db.close()

    # 학습 시작 성공 → 학습 완료까지 상태 폴링을 잇는다.
    poll_photo_avatar_training.delay(user_id)
    return {"user_id": user_id, "status": "training"}


@celery.task(bind=True, max_retries=_MAX_RETRIES, default_retry_delay=_RETRY_DELAY)
def poll_photo_avatar_training(self, user_id: str) -> dict:
    """그룹 학습 상태를 폴링해 ``user.photo_avatar_group_status`` 를 갱신."""
    from app.services.pipeline.heygen import HeyGenError, get_photo_avatar_group_status

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).one()
        if not user.photo_avatar_group_id:
            return {"user_id": user_id, "status": "none"}

        try:
            st = loop.run_until_complete(
                get_photo_avatar_group_status(user.photo_avatar_group_id)
            )
        except HeyGenError as exc:
            logger.warning("Photo Avatar 학습 상태 조회 실패(재시도): %s", exc)
            raise self.retry(exc=exc)

        status = st.get("status", "training")
        user.photo_avatar_group_status = status
        if status == "ready":
            user.photo_avatar_group_error = None  # 성공 — 이전 실패 사유 정리.
        elif status == "failed":
            # 폴링 단계 실패는 HeyGen 이 세부 사유를 주지 않으므로 unknown.
            user.photo_avatar_group_error = "unknown"
        db.commit()

        if status == "training":
            raise self.retry()
        logger.info("Photo Avatar 학습 종료: user=%s, status=%s", user_id, status)
        return {"user_id": user_id, "status": status}
    finally:
        loop.close()
        db.close()


@celery.task(bind=True, max_retries=_MAX_RETRIES, default_retry_delay=_RETRY_DELAY)
def poll_photo_avatar_looks(
    self, user_id: str, generation_id: str, prompt: str, count: int
) -> dict:
    """룩 생성 상태를 폴링해 완료 시 ``PhotoAvatarLook`` 행을 생성한다.

    같은 (user, heygen_look_id) 는 idempotent skip(재시도·중복 폴링 대비).
    """
    from app.services.pipeline.heygen import (
        HeyGenError,
        get_photo_avatar_generation_status,
    )

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).one()

        try:
            res = loop.run_until_complete(
                get_photo_avatar_generation_status(generation_id, count)
            )
        except HeyGenError as exc:
            raise self.retry(exc=exc)

        status = res.get("status", "pending")
        if status == "pending":
            raise self.retry()
        if status == "failed":
            logger.warning(
                "Photo Avatar 룩 생성 실패: user=%s, gen=%s", user_id, generation_id
            )
            return {"user_id": user_id, "status": "failed"}

        created = 0
        for lk in res.get("looks", []):
            look_id = lk.get("look_id")
            if not look_id:
                continue
            exists = (
                db.query(PhotoAvatarLook.id)
                .filter(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
                .first()
            )
            if exists:
                continue
            db.add(
                PhotoAvatarLook(
                    user_id=user.id,
                    heygen_look_id=look_id,
                    preview_image_url=lk.get("image_url") or None,
                    prompt=prompt,
                    status=LookStatus.ready.value,
                )
            )
            created += 1
        db.commit()

        # 룩 생성 비용 계측: per-look API 단가가 공개돼 있지 않아 신규 비용 테이블
        # 대신 로그로 실측을 추적한다(운영 API Usage 와 대조). 1회성·소액.
        logger.info(
            "Photo Avatar 룩 생성 완료(비용 계측): user=%s, gen=%s, created=%d",
            user_id, generation_id, created,
        )
        return {"user_id": user_id, "status": "ready", "created": created}
    finally:
        loop.close()
        db.close()


# ── v0.2: gpt-image-2 룩 생성 (HeyGen group/train 없음) ────────────────────────


def _ctype_from_key(key: str) -> str:
    """S3 key 확장자에서 이미지 content-type 추론(png 외엔 jpeg 취급)."""
    return "image/png" if key.lower().endswith(".png") else "image/jpeg"


@celery.task
def generate_gpt_looks(
    user_id: str,
    look_ids: list[str],
    persona: str,
    outfit: str | None,
    background: str | None,
    expression: str | None,
    extra: str | None,
    prop: str | None = None,
    pose: str | None = None,
) -> dict:
    """업로드 사진을 reference 로 gpt-image-2 룩을 생성해 placeholder 행을 채운다.

    엔드포인트가 미리 만든 ``status=generating`` 행(``look_ids``)을 id 로 찾아
    각 행에 생성 이미지의 S3 URL 을 채우고 ``ready`` 로 전환한다(없으면 ``failed``).

    멱등성: 대상 행이 모두 generating 이 아니면(이미 처리됨) 즉시 skip. 외부 오류는
    catch 해 행을 failed 로 두고 **재시도하지 않는다** — 재시도 시 새 이미지를 또
    생성해 비용이 중복되므로(생성은 1회성).

    모더레이션 거부(``OpenAIModerationRefused``)는 docs §0.6 D 의 '원본 사진 직행'
    fallback — 첫 행을 원본 사진 URL 로 ready 처리하고 나머지는 failed 로 둔다.
    이후 교수가 그 룩을 select 하면 기존 경로가 원본을 Talking Photo 로 등록한다.
    """
    from app.services.pipeline import openai_image
    from app.services.pipeline import s3 as s3_svc
    from app.services.pipeline.openai_image import (
        OpenAIImageError,
        OpenAIModerationRefused,
    )

    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).one()
        ids = [uuid.UUID(x) for x in look_ids]
        rows = (
            db.query(PhotoAvatarLook)
            .filter(
                PhotoAvatarLook.user_id == user.id,
                PhotoAvatarLook.id.in_(ids),
            )
            .all()
        )
        if not rows:
            return {"user_id": user_id, "status": "none"}
        # 멱등: 모든 대상 행이 이미 generating 을 벗어났으면(처리 완료) 재실행 skip.
        if all(r.status != LookStatus.generating.value for r in rows):
            return {"user_id": user_id, "status": "skipped"}

        if not user.profile_image_url:
            for r in rows:
                r.status = LookStatus.failed.value
            db.commit()
            return {"user_id": user_id, "status": "failed", "reason": "no_reference"}

        key = urlparse(user.profile_image_url).path.lstrip("/")
        ctype = _ctype_from_key(key)
        count = len(rows)

        try:
            ref_bytes = s3_svc.download_file(key)
            images = loop.run_until_complete(
                openai_image.generate_instructor_looks(
                    ref_bytes,
                    ctype,
                    persona,
                    outfit,
                    background,
                    expression,
                    extra,
                    count,
                    prop=prop,
                    pose=pose,
                )
            )
        except OpenAIModerationRefused:
            logger.warning(
                "gpt-image-2 모더레이션 거부 → 원본 사진 직행 fallback: user=%s", user_id
            )
            rows[0].image_url = user.profile_image_url
            rows[0].status = LookStatus.ready.value
            for r in rows[1:]:
                r.status = LookStatus.failed.value
            db.commit()
            logger.info(
                "gpt 룩 생성(비용 계측): user=%s, mode=moderation_fallback, created=1",
                user_id,
            )
            return {"user_id": user_id, "status": "ready", "created": 1, "fallback": True}
        except OpenAIImageError as exc:
            logger.warning("gpt 룩 생성 실패(재시도 안 함): user=%s, error=%s", user_id, exc)
            for r in rows:
                r.status = LookStatus.failed.value
            db.commit()
            return {"user_id": user_id, "status": "failed"}

        created = 0
        for r, img in zip(rows, images):
            # 16:9 로 선명하게 크롭(설정 시) — gpt-image-2 가 16:9 를 직접 못 만들어
            # 1536x1024(3:2)로 생성된 결과를 강의 영상(16:9) 톤에 맞춘다. 위쪽 여백을
            # 우선 잘라 하단(손·허리)을 보존한다.
            if settings.PHOTO_AVATAR_OUTPUT_16_9:
                img = openai_image.crop_to_16_9(img)
            s3_key = f"thumbnails/photo-avatar/{user.id}/look-{uuid.uuid4().hex[:8]}.png"
            s3_svc.upload_file(img, s3_key, content_type="image/png")
            r.image_url = (
                f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
            )
            r.status = LookStatus.ready.value
            created += 1
        # 생성된 이미지가 행보다 적으면 남는 placeholder 는 failed 처리.
        for r in rows[len(images):]:
            r.status = LookStatus.failed.value
        db.commit()

        logger.info(
            "gpt 룩 생성 완료(비용 계측): user=%s, requested=%d, created=%d",
            user_id, count, created,
        )
        return {"user_id": user_id, "status": "ready", "created": created}
    except Exception:
        # OpenAI 외 예상치 못한 오류(S3 다운/업로드·DB·네트워크 등)도 대상 placeholder
        # 가 generating 에 영구히 남지 않도록 failed 로 정리한 뒤 예외를 다시 올린다.
        # (reap_stuck_looks 가 backstop 이지만, beat 미가동 시에도 즉시 회복되도록
        # 태스크 자신이 1차로 정리한다.) 예외는 삼키지 않고 재전파해 로그·메트릭에
        # 실패가 드러나게 한다.
        logger.exception("gpt 룩 생성 중 예외 — 대상 룩을 failed 처리: user=%s", user_id)
        try:
            db.rollback()
            ids = [uuid.UUID(x) for x in look_ids]
            db.execute(
                update(PhotoAvatarLook)
                .where(
                    PhotoAvatarLook.user_id == uuid.UUID(user_id),
                    PhotoAvatarLook.id.in_(ids),
                    PhotoAvatarLook.status == LookStatus.generating.value,
                )
                .values(status=LookStatus.failed.value)
            )
            db.commit()
        except Exception:
            logger.exception("failed 정리 자체가 실패: user=%s", user_id)
            db.rollback()
        raise
    finally:
        loop.close()
        db.close()


# ── 정체된 룩 정리(reaper) — 누적 cap 의 영구 점유 방지 ────────────────────────


@celery.task
def reap_stuck_looks() -> dict:
    """오래 ``generating`` 에 머문 룩을 ``failed`` 로 정리한다(주기 태스크).

    워커 장애·중복 큐잉·브로커 단절 등으로 ``generate_gpt_looks`` 가 끝내 완료하지
    못하면 행이 ``generating`` 에 남는다. 누적 cap(``PHOTO_AVATAR_LOOK_TOTAL_MAX``)
    은 failed 를 제외한 룩으로 계산하므로, 정체된 generating 룩이 cap 을 영구
    점유해 **룩 생성 버튼이 사라지고 사용자가 빠져나올 수 없는** 상태가 된다.

    ``created_at`` 이 ``PHOTO_AVATAR_LOOK_STUCK_MINUTES`` 임계를 넘긴 generating 룩을
    failed 로 돌려(failed 는 cap 에서 제외 + UI 에서 숨김) 자가 회복시킨다. 실제로
    완료될 작업을 너무 일찍 죽이지 않도록 임계는 정상 생성 소요(수 분)보다 넉넉히
    크게 둔다.
    """
    db = SyncSessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(
            minutes=settings.PHOTO_AVATAR_LOOK_STUCK_MINUTES
        )
        result = db.execute(
            update(PhotoAvatarLook)
            .where(
                PhotoAvatarLook.status == LookStatus.generating.value,
                PhotoAvatarLook.created_at < cutoff,
            )
            .values(status=LookStatus.failed.value)
        )
        db.commit()
        reaped = result.rowcount or 0
        if reaped:
            logger.warning(
                "정체된 룩 %d건을 failed 로 정리(임계=%d분 초과 generating)",
                reaped,
                settings.PHOTO_AVATAR_LOOK_STUCK_MINUTES,
            )
        return {"reaped": reaped}
    finally:
        db.close()
