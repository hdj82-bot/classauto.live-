"""인앱 피드백 API (스펙 13 · F).

- 제출: 로그인 유저(교수/학생 공통) — POST /api/v1/feedback
- 운영자 조회/상태변경: require_admin — GET/PATCH /api/v1/admin/feedback

흩어진 이메일 대신 유저·강의에 묶어 운영자 콘솔로 모으기 위함. 학생도 제출
가능하지만 이는 '조회' 경로일 뿐 학생 가입/학습 흐름과 무관하다.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.feedback import Feedback
from app.models.user import User
from app.schemas.feedback import (
    FeedbackCreateRequest,
    FeedbackResponse,
    FeedbackStatusUpdateRequest,
)

router = APIRouter(tags=["feedback"])


def _to_response(fb: Feedback) -> FeedbackResponse:
    return FeedbackResponse(
        id=str(fb.id),
        user_id=str(fb.user_id) if fb.user_id else None,
        user_email=fb.user_email,
        role=fb.role,
        category=fb.category,
        message=fb.message,
        lecture_id=str(fb.lecture_id) if fb.lecture_id else None,
        page=fb.page,
        status=fb.status,
        created_at=fb.created_at,
    )


@router.post(
    "/api/v1/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="인앱 피드백 제출 (교수/학생 공통)",
)
async def submit_feedback(
    body: FeedbackCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fb = Feedback(
        id=uuid.uuid4(),
        user_id=user.id,
        user_email=user.email,
        role=user.role.value,
        category=body.category,
        message=body.message,
        lecture_id=body.lecture_id,
        page=body.page,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return _to_response(fb)


@router.get(
    "/api/v1/admin/feedback",
    summary="피드백 목록 (운영자 전용)",
)
async def list_feedback(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    role: str | None = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """피드백 목록 (페이지네이션, status/category/role 필터)."""
    stmt = select(Feedback)
    count_stmt = select(func.count()).select_from(Feedback)

    filters = []
    if status_filter:
        filters.append(Feedback.status == status_filter)
    if category:
        filters.append(Feedback.category == category)
    if role:
        filters.append(Feedback.role == role)
    for f in filters:
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(Feedback.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "feedback": [_to_response(fb).model_dump() for fb in rows],
    }


@router.patch(
    "/api/v1/admin/feedback/{feedback_id}",
    response_model=FeedbackResponse,
    summary="피드백 상태 변경 (운영자 전용)",
)
async def update_feedback_status(
    feedback_id: uuid.UUID,
    body: FeedbackStatusUpdateRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """open / triaged / resolved 상태 토글."""
    fb = await db.get(Feedback, feedback_id)
    if fb is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="피드백을 찾을 수 없습니다."
        )
    fb.status = body.status
    await db.commit()
    await db.refresh(fb)
    return _to_response(fb)
