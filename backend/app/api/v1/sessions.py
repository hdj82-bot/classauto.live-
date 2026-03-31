"""세션 관리 API (NestJS SessionController 포팅)."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_student
from app.db.session import get_db
from app.models.session import SessionStatus
from app.models.user import User
from app.services import session as session_svc

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.post("", summary="세션 시작")
async def create_session(
    lecture_id: uuid.UUID,
    total_sec: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    session = await session_svc.create_session(db, user.id, lecture_id, total_sec)
    return {"id": str(session.id), "status": session.status.value}


@router.patch("/{session_id}", summary="세션 상태 업데이트")
async def update_session(
    session_id: uuid.UUID,
    status: str,
    watched_sec: int | None = None,
    progress_pct: float | None = None,
    pause_reason: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    session = await session_svc.update_session_status(
        db, user.id, session_id, SessionStatus(status),
        watched_sec=watched_sec, progress_pct=progress_pct, pause_reason=pause_reason,
    )
    return {"id": str(session.id), "status": session.status.value}


@router.post("/{session_id}/complete", summary="세션 완료")
async def complete_session(
    session_id: uuid.UUID,
    watched_sec: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    session = await session_svc.complete_session(db, user.id, session_id, watched_sec)
    return {"id": str(session.id), "status": session.status.value, "progress_pct": session.progress_pct}


@router.get("/{session_id}", summary="세션 조회")
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await session_svc.get_session(db, user.id, session_id)
    return session


@router.get("", summary="내 세션 목록")
async def list_sessions(
    lecture_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sessions = await session_svc.list_my_sessions(db, user.id, lecture_id)
    return sessions
