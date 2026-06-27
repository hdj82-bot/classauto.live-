"""교수자 가입 초대 API.

- 운영자(require_owner): 초대 발급/목록/취소 — /api/owner/invites
- 공개(토큰 보유자): 초대 정보 조회 — /api/auth/invite/{token}
  (랜딩 페이지가 초대 대상 이메일·상태를 표시하기 위함. 토큰을 아는 사람만 접근.)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.core.config import settings
from app.db.session import get_db
from app.models.invite import ProfessorInvite
from app.models.user import User
from app.schemas.invite import (
    InviteCreateRequest,
    InvitePublicInfo,
    InviteResponse,
)
from app.services.admin_audit import log_admin_action
from app.services.invite import (
    create_invite,
    delete_invite,
    get_invite_by_token,
    invite_status,
    list_invites,
)

owner_router = APIRouter(prefix="/api/owner/invites", tags=["invites"])
public_router = APIRouter(prefix="/api/auth/invite", tags=["invites"])


def _to_response(inv: ProfessorInvite) -> InviteResponse:
    return InviteResponse(
        id=str(inv.id),
        token=inv.token,
        email=inv.email,
        role=inv.role,
        cohort=inv.cohort,
        status=invite_status(inv),
        invite_url=f"{settings.FRONTEND_URL}/auth/invite?token={inv.token}",
        created_at=inv.created_at,
        expires_at=inv.expires_at,
        used_at=inv.used_at,
    )


@owner_router.post(
    "",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="교수자 초대 링크 발급 (운영자 전용)",
)
async def create_professor_invite(
    body: InviteCreateRequest,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    inv = await create_invite(
        db, email=body.email, created_by=owner.id, cohort=body.cohort
    )
    # E: god-mode 추적 — 초대 발급을 감사 로그에 남긴다.
    await log_admin_action(
        db,
        owner,
        "invite.create",
        target_type="invite",
        target_id=str(inv.id),
        detail={"email": inv.email, "cohort": inv.cohort},
    )
    return _to_response(inv)


@owner_router.get(
    "",
    response_model=list[InviteResponse],
    summary="발급한 초대 목록 (운영자 전용)",
)
async def list_professor_invites(
    _owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return [_to_response(inv) for inv in await list_invites(db)]


@owner_router.delete(
    "/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="초대 취소/삭제 (운영자 전용)",
)
async def revoke_professor_invite(
    invite_id: uuid.UUID,
    owner: User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    # 삭제 전 이메일을 확보해 감사 로그 detail 에 남긴다.
    target = await db.get(ProfessorInvite, invite_id)
    target_email = target.email if target is not None else None

    ok = await delete_invite(db, invite_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="초대를 찾을 수 없습니다."
        )
    # E: god-mode 추적 — 초대 취소/삭제를 감사 로그에 남긴다.
    await log_admin_action(
        db,
        owner,
        "invite.delete",
        target_type="invite",
        target_id=str(invite_id),
        detail={"email": target_email},
    )


@public_router.get(
    "/{token}",
    response_model=InvitePublicInfo,
    summary="초대 정보 조회 (랜딩 페이지용, 토큰 보유자)",
)
async def get_invite_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    inv = await get_invite_by_token(db, token)
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="유효하지 않은 초대입니다."
        )
    return InvitePublicInfo(
        email=inv.email, role=inv.role, status=invite_status(inv)
    )
