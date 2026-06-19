"""교수자 개입 행동 로그 서비스 (스펙 11 §H-4 / 10번 G3, RQ2).

격려·권고 채택·메모를 기록하고 목록을 돌려준다. 실제 외부 발송(이메일/알림)
채널은 후속 — status='recorded' 로 남긴다. 발송 채널 도입 시 이 서비스가
발송 후 status 를 갱신하면 된다.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.instructor_action import InstructorAction
from app.models.user import User
from app.schemas.action import ActionCreate


def _to_response(action: InstructorAction, target_name: str | None) -> dict:
    return {
        "id": action.id,
        "lecture_id": action.lecture_id,
        "instructor_id": action.instructor_id,
        "action_type": action.action_type,
        "target_user_id": action.target_user_id,
        "target_name": target_name,
        "message": action.message,
        "status": action.status,
        "created_at": action.created_at,
    }


async def create_action(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    instructor_id: uuid.UUID,
    body: ActionCreate,
) -> dict:
    action = InstructorAction(
        lecture_id=lecture_id,
        instructor_id=instructor_id,
        action_type=body.action_type.value,
        target_user_id=body.target_user_id,
        message=body.message,
        status="recorded",
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    target_name = None
    if action.target_user_id is not None:
        target = await db.get(User, action.target_user_id)
        target_name = target.name if target else None
    return _to_response(action, target_name)


async def list_actions(
    db: AsyncSession, lecture_id: uuid.UUID, limit: int = 100
) -> list[dict]:
    rows = list(
        (
            await db.execute(
                select(InstructorAction, User.name)
                .outerjoin(User, User.id == InstructorAction.target_user_id)
                .where(InstructorAction.lecture_id == lecture_id)
                .order_by(InstructorAction.created_at.desc())
                .limit(limit)
            )
        ).all()
    )
    return [_to_response(action, target_name) for action, target_name in rows]
