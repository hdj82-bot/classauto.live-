"""베타 신청 API — 대문 '베타 신청하기' 폼.

- 제출: **공개**(비로그인) — POST /api/beta-applications. 신청자는 아직 가입 전이다.
- 운영자 조회/상태변경: require_owner(ADMIN_EMAILS) — GET/PATCH /api/admin/beta-applications.

흩어진 이메일 대신 운영자 콘솔(/admin) 수신함으로 모은다. 운영자(예: hdj82)가
콘솔에서 신청을 검토·상태 변경한다. 발급/검토 행위는 감사 로그에 남긴다.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.db.session import get_db
from app.models.beta_application import BetaApplication
from app.models.user import User
from app.schemas.beta_application import (
    BetaApplicationCreateRequest,
    BetaApplicationResponse,
    BetaApplicationStatusUpdateRequest,
)
from app.services.admin_audit import log_admin_action

public_router = APIRouter(tags=["beta-applications"])
owner_router = APIRouter(tags=["beta-applications (owner)"])


def _to_response(app_: BetaApplication) -> BetaApplicationResponse:
    return BetaApplicationResponse(
        id=str(app_.id),
        name=app_.name,
        school=app_.school,
        department=app_.department,
        professor_title=app_.professor_title,
        email=app_.email,
        subject=app_.subject,
        student_count=app_.student_count,
        start_timing=app_.start_timing,
        channel=app_.channel,
        message=app_.message,
        status=app_.status,
        created_at=app_.created_at,
    )


@public_router.post(
    "/api/beta-applications",
    response_model=BetaApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="베타 신청 제출 (공개)",
)
async def submit_beta_application(
    body: BetaApplicationCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    app_ = BetaApplication(
        id=uuid.uuid4(),
        name=body.name.strip(),
        school=body.school.strip(),
        department=body.department.strip(),
        professor_title=body.professor_title.strip(),
        email=body.email,  # 스키마에서 소문자 정규화됨
        subject=body.subject.strip(),
        student_count=(body.student_count or "").strip() or None,
        start_timing=body.start_timing,
        channel=body.channel,
        message=(body.message or "").strip() or None,
    )
    db.add(app_)
    await db.commit()
    await db.refresh(app_)
    return _to_response(app_)


@owner_router.get(
    "/api/admin/beta-applications",
    summary="베타 신청 목록 (운영자 전용)",
)
async def list_beta_applications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    _owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """최신순 목록 (페이지네이션 + status 필터)."""
    stmt = select(BetaApplication)
    count_stmt = select(func.count()).select_from(BetaApplication)
    if status_filter:
        stmt = stmt.where(BetaApplication.status == status_filter)
        count_stmt = count_stmt.where(BetaApplication.status == status_filter)

    total = (await db.execute(count_stmt)).scalar() or 0
    new_count = (
        await db.execute(
            select(func.count())
            .select_from(BetaApplication)
            .where(BetaApplication.status == "new")
        )
    ).scalar() or 0
    stmt = (
        stmt.order_by(BetaApplication.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "new_count": new_count,
        "page": page,
        "limit": limit,
        "applications": [_to_response(a).model_dump() for a in rows],
    }


@owner_router.patch(
    "/api/admin/beta-applications/{application_id}",
    response_model=BetaApplicationResponse,
    summary="베타 신청 상태 변경 (운영자 전용)",
)
async def update_beta_application_status(
    application_id: uuid.UUID,
    body: BetaApplicationStatusUpdateRequest,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """new / contacted / approved / rejected 상태 변경 + 감사 로그."""
    app_ = await db.get(BetaApplication, application_id)
    if app_ is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="신청을 찾을 수 없습니다."
        )
    old = app_.status
    app_.status = body.status
    await log_admin_action(
        db,
        owner,
        "beta_application.set_status",
        target_type="beta_application",
        target_id=str(app_.id),
        detail={"email": app_.email, "from": old, "to": app_.status},
    )
    await db.commit()
    await db.refresh(app_)
    return _to_response(app_)
