"""운영자 감사 로그 기록 헬퍼.

라우터 계층(actor User 객체를 가진 곳)에서 호출해 ``AdminAuditLog`` 1행을
남긴다. 호출자가 이미 본 작업(역할 변경·삭제·초대 발급 등)을 성공적으로
커밋한 직후에 부르는 것을 전제로 하며, 감사 로그 자체도 커밋한다.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User

logger = logging.getLogger(__name__)


async def log_admin_action(
    db: AsyncSession,
    actor: User | None,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict | None = None,
) -> None:
    """운영자 행위를 감사 로그에 1행 기록(best-effort).

    감사 로그 실패가 본 작업(이미 커밋됨)을 되돌리거나 사용자 요청을 깨뜨려선
    안 되므로, 기록 실패는 경고만 남기고 삼킨다.
    """
    try:
        entry = AdminAuditLog(
            id=uuid.uuid4(),
            actor_id=actor.id if actor else None,
            actor_email=(actor.email if actor else None),
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
        db.add(entry)
        await db.commit()
    except Exception as exc:  # noqa: BLE001 — 감사 로그 실패는 요청을 깨뜨리지 않는다.
        logger.warning("감사 로그 기록 실패: action=%s target=%s: %s", action, target_id, exc)
        await db.rollback()
