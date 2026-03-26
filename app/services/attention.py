"""IFL HeyGen — 집중 경고 서비스.

3단계 경고 시스템:
  Level 0: 정상
  Level 1: "집중해 주세요! 🙏"
  Level 2: "대면 수업 때 혼나요! 😅"
  Level 3: "이러면 점수 드릴 수가 없어요 😢" → 영상 일시정지

네트워크 불안정 감지 시 무반응 타이머를 중단하여 오탐을 방지한다.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import WARNING_MESSAGES
from app.models.session_log import SessionLog

logger = logging.getLogger(__name__)

MAX_WARNING_LEVEL = 3


async def start_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    lecture_id: uuid.UUID,
) -> SessionLog:
    """학습 세션을 시작하고 SessionLog를 생성한다."""
    existing = await _get_session(db, session_id)
    if existing:
        return existing

    log = SessionLog(
        session_id=session_id,
        user_id=user_id,
        lecture_id=lecture_id,
        warning_level=0,
        no_response_cnt=0,
        is_paused=False,
        is_network_unstable=False,
        last_heartbeat_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.flush()
    logger.info("세션 시작: session_id=%s, user_id=%s", session_id, user_id)
    return log


async def process_heartbeat(
    db: AsyncSession,
    session_id: uuid.UUID,
    progress_seconds: int,
    is_network_unstable: bool,
) -> SessionLog:
    """클라이언트 heartbeat를 처리한다.

    - 네트워크 상태를 갱신한다.
    - 정상 heartbeat가 오면 warning_level을 유지한다 (응답이 있으므로).
    - progress_seconds를 갱신한다.
    """
    log = await _get_session_or_raise(db, session_id)

    log.last_heartbeat_at = datetime.now(timezone.utc)
    log.progress_seconds = progress_seconds
    log.is_network_unstable = is_network_unstable

    await db.flush()
    return log


async def handle_no_response(db: AsyncSession, session_id: uuid.UUID) -> dict:
    """무반응 이벤트를 처리하고 경고 레벨을 올린다.

    Returns:
        {
            "warning_level": int,
            "message": str | None,
            "should_pause": bool,
            "no_response_cnt": int,
        }
    """
    log = await _get_session_or_raise(db, session_id)

    # 네트워크 불안정 시 무반응으로 간주하지 않는다
    if log.is_network_unstable:
        logger.info(
            "네트워크 불안정으로 무반응 무시: session_id=%s", session_id
        )
        return {
            "warning_level": log.warning_level,
            "message": None,
            "should_pause": log.is_paused,
            "no_response_cnt": log.no_response_cnt,
        }

    # 이미 일시정지 상태면 레벨을 더 올리지 않는다
    if log.is_paused:
        log.no_response_cnt += 1
        await db.flush()
        return {
            "warning_level": log.warning_level,
            "message": WARNING_MESSAGES.get(log.warning_level),
            "should_pause": True,
            "no_response_cnt": log.no_response_cnt,
        }

    # 경고 레벨 상승
    log.warning_level = min(log.warning_level + 1, MAX_WARNING_LEVEL)
    log.no_response_cnt += 1
    message = WARNING_MESSAGES.get(log.warning_level)

    # 3단계 도달 시 영상 일시정지
    should_pause = log.warning_level >= MAX_WARNING_LEVEL
    if should_pause:
        log.is_paused = True

    await db.flush()

    logger.info(
        "무반응 경고: session_id=%s, level=%d, pause=%s, cnt=%d",
        session_id, log.warning_level, should_pause, log.no_response_cnt,
    )
    return {
        "warning_level": log.warning_level,
        "message": message,
        "should_pause": should_pause,
        "no_response_cnt": log.no_response_cnt,
    }


async def resume_session(db: AsyncSession, session_id: uuid.UUID) -> SessionLog:
    """일시정지된 세션을 재개한다.

    warning_level은 유지하되 is_paused만 해제한다.
    재개 후 다시 무반응이 발생하면 즉시 3단계가 되어 다시 일시정지된다.
    """
    log = await _get_session_or_raise(db, session_id)
    log.is_paused = False
    log.last_heartbeat_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("세션 재개: session_id=%s", session_id)
    return log


async def get_session_status(db: AsyncSession, session_id: uuid.UUID) -> SessionLog:
    """세션 상태를 조회한다."""
    return await _get_session_or_raise(db, session_id)


# ── 내부 헬퍼 ───────────────────────────────────────────────
async def _get_session(db: AsyncSession, session_id: uuid.UUID) -> SessionLog | None:
    stmt = select(SessionLog).where(SessionLog.session_id == session_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _get_session_or_raise(db: AsyncSession, session_id: uuid.UUID) -> SessionLog:
    log = await _get_session(db, session_id)
    if log is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return log
