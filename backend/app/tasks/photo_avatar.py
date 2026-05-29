"""Photo Avatar(Design with AI) 비동기 폴링 태스크.

HeyGen 그룹 학습·룩 생성은 비동기라 generation/group 상태를 폴링해야 한다.
기존 poll_pending_renders 패턴(SyncSessionLocal + run_until_complete + 재시도)을 따른다.
HEYGEN_MOCK 일 때 클라이언트가 즉시 ready 를 반환하므로 외부 호출 없이 완료된다.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.models.photo_avatar import LookStatus, PhotoAvatarLook
from app.models.user import User

logger = logging.getLogger(__name__)

# 폴링 상한: 10초 간격 × 90회 ≈ 15분. 학습·룩 생성이 그 안에 끝난다는 전제.
_MAX_RETRIES = 90
_RETRY_DELAY = 10


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
