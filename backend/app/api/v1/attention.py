"""집중도 모니터링 API (app/api/attention.py 흡수)."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import session as session_svc

router = APIRouter(prefix="/api/v1/attention", tags=["attention"])


@router.post("/start", summary="집중도 추적 시작")
async def start_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    session = await session_svc.start_attention_tracking(db, session_id, user_id, lecture_id)
    return {"session_id": str(session.id), "warning_level": session.warning_level}


@router.post("/heartbeat", summary="하트비트")
async def heartbeat(
    session_id: uuid.UUID,
    progress_seconds: int,
    is_network_unstable: bool = False,
    db: AsyncSession = Depends(get_db),
):
    session = await session_svc.process_heartbeat(db, session_id, progress_seconds, is_network_unstable)
    return {"session_id": str(session.id), "progress_seconds": session.progress_seconds}


@router.post("/no-response", summary="무반응 이벤트")
async def no_response(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await session_svc.handle_no_response(db, session_id)


@router.post("/resume", summary="세션 재개")
async def resume(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    session = await session_svc.resume_session(db, session_id)
    return {
        "session_id": str(session.id),
        "warning_level": session.warning_level,
        "is_paused": session.is_paused,
        "message": "영상이 재개되었습니다.",
    }
