"""세션 관리 서비스 (NestJS SessionService + app/ AttentionService 통합)."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import (
    LearningSession,
    SessionStatus,
    can_transition,
    get_allowed_transitions,
)

WARNING_MESSAGES: dict[int, str] = {
    1: "집중해 주세요!",
    2: "대면 수업 때 혼나요!",
    3: "이러면 점수 드릴 수가 없어요",
}


# ── 세션 CRUD ────────────────────────────────────────────────────────────────


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, lecture_id: uuid.UUID, total_sec: int
) -> LearningSession:
    session = LearningSession(
        user_id=user_id,
        lecture_id=lecture_id,
        total_sec=total_sec,
        status=SessionStatus.in_progress,
        started_at=datetime.now(timezone.utc),
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def update_session_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    new_status: SessionStatus,
    watched_sec: int | None = None,
    progress_pct: float | None = None,
    pause_reason: str | None = None,
) -> LearningSession:
    session = await _find_owned_session(db, user_id, session_id)

    if not can_transition(session.status, new_status):
        allowed = get_allowed_transitions(session.status)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{session.status.value} → {new_status.value} 전환 불가. "
                   f"가능한 상태: [{', '.join(s.value for s in allowed)}]",
        )

    session.status = new_status
    session.last_active_at = datetime.now(timezone.utc)

    if new_status == SessionStatus.paused:
        session.pause_reason = pause_reason or "network_disconnect"
        session.is_paused = True
    elif session.status == SessionStatus.paused and new_status == SessionStatus.in_progress:
        session.pause_reason = None
        session.is_paused = False

    if pause_reason == "no_response":
        session.no_response_cnt += 1

    if watched_sec is not None:
        session.watched_sec = watched_sec
    if progress_pct is not None:
        session.progress_pct = progress_pct

    await db.commit()
    await db.refresh(session)
    return session


async def complete_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID,
    watched_sec: int | None = None,
) -> LearningSession:
    session = await _find_owned_session(db, user_id, session_id)

    if not can_transition(session.status, SessionStatus.completed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{session.status.value} 상태에서는 완료 처리할 수 없습니다.",
        )

    session.status = SessionStatus.completed
    session.progress_pct = 100.0
    session.watched_sec = watched_sec if watched_sec is not None else session.watched_sec
    session.completed_at = datetime.now(timezone.utc)
    session.last_active_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> LearningSession:
    return await _find_owned_session(db, user_id, session_id)


async def list_my_sessions(
    db: AsyncSession, user_id: uuid.UUID, lecture_id: uuid.UUID | None = None
) -> list[LearningSession]:
    stmt = select(LearningSession).where(LearningSession.user_id == user_id)
    if lecture_id:
        stmt = stmt.where(LearningSession.lecture_id == lecture_id)
    stmt = stmt.order_by(LearningSession.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── 집중도 추적 (app/ attention 흡수) ────────────────────────────────────────


async def start_attention_tracking(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, lecture_id: uuid.UUID
) -> LearningSession:
    """집중도 추적 시작 — 기존 세션에 heartbeat 활성화."""
    session = await _find_owned_session(db, user_id, session_id)
    session.last_heartbeat_at = datetime.now(timezone.utc)
    session.warning_level = 0
    await db.commit()
    await db.refresh(session)
    return session


async def process_heartbeat(
    db: AsyncSession, session_id: uuid.UUID, progress_seconds: int,
    is_network_unstable: bool = False,
) -> LearningSession:
    """하트비트 수신 — 진행 시간 및 네트워크 상태 업데이트."""
    result = await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    session.progress_seconds = progress_seconds
    session.is_network_unstable = is_network_unstable
    session.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


async def handle_no_response(
    db: AsyncSession, session_id: uuid.UUID
) -> dict:
    """무반응 이벤트 처리 — 경고 레벨 증가."""
    result = await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    if session.is_network_unstable:
        return {
            "session_id": session.id,
            "warning_level": session.warning_level,
            "message": None,
            "should_pause": False,
            "no_response_cnt": session.no_response_cnt,
        }

    session.no_response_cnt += 1
    session.warning_level = min(session.warning_level + 1, 3)

    should_pause = session.warning_level >= 3
    if should_pause:
        session.is_paused = True

    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "warning_level": session.warning_level,
        "message": WARNING_MESSAGES.get(session.warning_level),
        "should_pause": should_pause,
        "no_response_cnt": session.no_response_cnt,
    }


async def resume_session(db: AsyncSession, session_id: uuid.UUID) -> LearningSession:
    """일시 정지된 세션 재개."""
    result = await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    session.is_paused = False
    session.warning_level = max(session.warning_level - 1, 0)
    session.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────


async def _find_owned_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> LearningSession:
    result = await db.execute(
        select(LearningSession).where(LearningSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="본인의 세션만 접근할 수 있습니다.")
    return session
