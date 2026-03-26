"""IFL HeyGen — 집중 경고 시스템 API 라우터.

POST   /api/attention/session       — 세션 시작
POST   /api/attention/heartbeat     — heartbeat (진행/네트워크 상태)
POST   /api/attention/no-response   — 무반응 이벤트 → 경고 레벨 상승
POST   /api/attention/resume        — 일시정지 해제
GET    /api/attention/{session_id}   — 세션 상태 조회
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import (
    AttentionSessionStartRequest,
    HeartbeatRequest,
    NoResponseEvent,
    ResumeRequest,
    ResumeResponse,
    SessionStatusResponse,
    WarningResponse,
)
from app.services.attention import (
    get_session_status,
    handle_no_response,
    process_heartbeat,
    resume_session,
    start_session,
)

attention_router = APIRouter(prefix="/api/attention", tags=["attention"])


@attention_router.post("/session", response_model=SessionStatusResponse)
async def create_session(
    body: AttentionSessionStartRequest,
    db: AsyncSession = Depends(get_db),
):
    """학습 세션을 시작하고 집중도 추적을 개시한다."""
    log = await start_session(db, body.session_id, body.user_id, body.lecture_id)
    await db.commit()
    return _to_status_response(log)


@attention_router.post("/heartbeat", response_model=SessionStatusResponse)
async def heartbeat(
    body: HeartbeatRequest,
    db: AsyncSession = Depends(get_db),
):
    """클라이언트에서 주기적으로 보내는 heartbeat.

    - progress_seconds: 현재 시청 위치
    - is_network_unstable: True이면 무반응 타이머 중단
    """
    log = await process_heartbeat(
        db, body.session_id, body.progress_seconds, body.is_network_unstable
    )
    await db.commit()
    return _to_status_response(log)


@attention_router.post("/no-response", response_model=WarningResponse)
async def no_response(
    body: NoResponseEvent,
    db: AsyncSession = Depends(get_db),
):
    """무반응 감지 시 경고 레벨을 올린다.

    - 1단계: "집중해 주세요! 🙏"
    - 2단계: "대면 수업 때 혼나요! 😅"
    - 3단계: "이러면 점수 드릴 수가 없어요 😢" → 영상 일시정지
    - 네트워크 불안정 시 무시됨
    """
    result = await handle_no_response(db, body.session_id)
    await db.commit()
    return WarningResponse(
        session_id=body.session_id,
        warning_level=result["warning_level"],
        message=result["message"],
        should_pause=result["should_pause"],
        no_response_cnt=result["no_response_cnt"],
    )


@attention_router.post("/resume", response_model=ResumeResponse)
async def resume(
    body: ResumeRequest,
    db: AsyncSession = Depends(get_db),
):
    """3단계 일시정지 후 영상을 재개한다."""
    log = await resume_session(db, body.session_id)
    await db.commit()
    return ResumeResponse(
        session_id=log.session_id,
        warning_level=log.warning_level,
        is_paused=log.is_paused,
    )


@attention_router.get("/{session_id}", response_model=SessionStatusResponse)
async def get_status(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """세션의 현재 집중 경고 상태를 조회한다."""
    log = await get_session_status(db, session_id)
    return _to_status_response(log)


def _to_status_response(log) -> SessionStatusResponse:
    return SessionStatusResponse(
        session_id=log.session_id,
        user_id=log.user_id,
        lecture_id=log.lecture_id,
        warning_level=log.warning_level,
        no_response_cnt=log.no_response_cnt,
        is_paused=log.is_paused,
        is_network_unstable=log.is_network_unstable,
        progress_seconds=log.progress_seconds,
        total_pause_seconds=log.total_pause_seconds,
        last_heartbeat_at=log.last_heartbeat_at,
    )
