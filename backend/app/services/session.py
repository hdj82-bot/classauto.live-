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


# ── 부정행위 방지 상수 (C2) ─────────────────────────────────────────────────
# 진행률·완료를 클라이언트 보고 대신 서버가 잰 경과시간으로만 인정하기 위한 값들.

# 같은 user+lecture 로 동시에 열어둘 수 있는 활성(미완료) 세션 개수 상한.
# 멀티 탭/멀티 디바이스로 한 강의를 동시 소비하는 부정행위를 막는다.
MAX_CONCURRENT_ACTIVE_SESSIONS = 1

# 플레이어 음성 빠르기 상한(PlayerV2 voiceRate 0.5~2.0). 서버가 인정하는
# "시청 가능 시간"의 상한 = 경과 실시간 × 이 배속. 실시간보다 빠르게 봤다는
# 클라 보고는 부정행위로 간주해 깎는다.
MAX_PLAYBACK_RATE = 2.0

# 클럭 스큐·버퍼링·하트비트 지연을 흡수하는 고정 여유(초).
ELAPSED_GRACE_SEC = 5

# 완료로 인정하기 위한 최소 진행률(서버 측정 시청량 / total_sec).
COMPLETION_MIN_RATIO = 0.9

# 동시 재생 제한 대상 상태 — 재생 중으로 볼 수 있는 활성 상태.
# completed(종료)·paused(닫고 잠시 비움)는 제외해 닫았다 다시 여는 학생을 막지 않는다.
CONCURRENCY_STATUSES = (
    SessionStatus.not_started,
    SessionStatus.in_progress,
    SessionStatus.qa_mode,
    SessionStatus.assessment,
)

# 마지막 활동(하트비트/활성/시작) 이후 이 시간이 지난 세션은 '재생 중'으로 치지 않는다.
# 탭이 크래시해 정리 신호 없이 in_progress 로 남은 세션이 학생을 영구히 잠그는 것을 막는다.
# 하트비트 간격(기본 10s)을 충분히 덮는 여유값.
CONCURRENT_LIVE_STALE_SEC = 90


def _aware(ts: datetime | None) -> datetime | None:
    """naive datetime 을 UTC 로 간주해 tz-aware 로 정규화."""
    if ts is None:
        return None
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=timezone.utc)


def _is_live_session(session: LearningSession, now: datetime) -> bool:
    """최근 하트비트/활성/시작 시각 중 가장 최신이 staleness 창 안이면 '재생 중'."""
    latest = None
    for ts in (session.last_heartbeat_at, session.last_active_at, session.started_at):
        ts = _aware(ts)
        if ts is None:
            continue
        if latest is None or ts > latest:
            latest = ts
    if latest is None:
        return False
    return (now - latest).total_seconds() <= CONCURRENT_LIVE_STALE_SEC


def _server_elapsed_seconds(session: LearningSession) -> float:
    """세션 시작(started_at) 이후 서버 기준 경과 실시간(초). 음수 방지."""
    started = _aware(session.started_at)
    if started is None:
        return 0.0
    return max(0.0, (datetime.now(timezone.utc) - started).total_seconds())


def _max_server_watchable(session: LearningSession) -> float:
    """서버가 인정하는 시청 가능 시간 상한(초).

    경과 실시간 × 최대 배속 + 여유. 클라가 보고하는 watched_sec/progress_seconds
    는 이 값을 넘을 수 없다(실시간보다 빠른 시청 = 부정행위).
    """
    return _server_elapsed_seconds(session) * MAX_PLAYBACK_RATE + ELAPSED_GRACE_SEC


def _effective_watched_sec(session: LearningSession, client_watched_sec: int | None) -> int:
    """클라 보고 watched_sec 를 total_sec 및 서버 측정 상한으로 깎은 값."""
    reported = (
        session.watched_sec if client_watched_sec is None else max(0, client_watched_sec)
    )
    ceiling = min(float(session.total_sec or 0), _max_server_watchable(session))
    return int(max(0.0, min(float(reported), ceiling)))


# ── 세션 CRUD ────────────────────────────────────────────────────────────────


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, lecture_id: uuid.UUID, total_sec: int
) -> LearningSession:
    # 동시 재생 제한 — 같은 user+lecture 의 '재생 중'(활성 상태 + 최근 활동) 세션이
    # 상한 이상이면 거부한다. staleness 로 거른 뒤 세어 크래시로 남은 세션이 학생을
    # 영구히 잠그지 않게 한다.
    candidates = await db.execute(
        select(LearningSession).where(
            LearningSession.user_id == user_id,
            LearningSession.lecture_id == lecture_id,
            LearningSession.status.in_(CONCURRENCY_STATUSES),
        )
    )
    now = datetime.now(timezone.utc)
    live = sum(1 for s in candidates.scalars().all() if _is_live_session(s, now))
    if live >= MAX_CONCURRENT_ACTIVE_SESSIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 진행 중인 학습 세션이 있습니다. 동시 재생은 허용되지 않습니다.",
        )

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

    from_status = session.status
    session.status = new_status
    session.last_active_at = datetime.now(timezone.utc)

    if new_status == SessionStatus.paused:
        session.pause_reason = pause_reason or "network_disconnect"
        session.is_paused = True
    elif from_status == SessionStatus.paused and new_status == SessionStatus.in_progress:
        session.pause_reason = None
        session.is_paused = False

    if pause_reason == "no_response":
        session.no_response_cnt += 1

    # 부정행위 방지: 클라 watched_sec 는 total_sec·서버 측정 경과시간 상한으로 깎고,
    # 진행률은 클라 보고(progress_pct)를 신뢰하지 않고 서버가 잰 시청량으로만 산출한다.
    # (progress_pct 파라미터는 하위호환을 위해 받기만 하고 값은 무시한다.)
    if watched_sec is not None:
        session.watched_sec = _effective_watched_sec(session, watched_sec)
    if session.total_sec > 0:
        session.progress_pct = max(
            0.0, min(100.0, session.watched_sec / session.total_sec * 100.0)
        )

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

    # 부정행위 방지: 클라가 100% 라고 보고해도 무조건 신뢰하지 않는다.
    # 서버가 잰 시청량(경과 실시간·하트비트 기반)이 total_sec 의 일정 비율 이상일
    # 때만 완료로 인정한다. 부족하면 측정된 진행률만 반영하고 409 로 거부한다.
    effective = _effective_watched_sec(session, watched_sec)
    required = COMPLETION_MIN_RATIO * (session.total_sec or 0)

    if effective < required:
        session.watched_sec = effective
        if session.total_sec > 0:
            session.progress_pct = max(
                0.0, min(100.0, effective / session.total_sec * 100.0)
            )
        session.last_active_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(session)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "아직 완료 조건을 충족하지 않았습니다. "
                f"서버 측정 진행률 {session.progress_pct:.0f}% "
                f"(완료 기준 {int(COMPLETION_MIN_RATIO * 100)}%)."
            ),
        )

    session.status = SessionStatus.completed
    session.progress_pct = 100.0
    session.watched_sec = effective
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
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, progress_seconds: int,
    is_network_unstable: bool = False,
) -> LearningSession:
    """하트비트 수신 — 진행 시간 및 네트워크 상태 업데이트.

    부정행위 방지: 클라가 보고한 progress_seconds 는 서버가 잰 경과 실시간 상한
    (_max_server_watchable)·total_sec 으로 깎는다. 이렇게 깎인 값을 서버가 인정하는
    시청량(watched_sec)으로 단조 증가시키고, 진행률도 여기서만 산출한다. 완료 판정
    (complete_session)은 이 서버 측정 시청량을 근거로 한다.
    """
    session = await _find_owned_session(db, user_id, session_id)

    ceiling = _max_server_watchable(session)
    if session.total_sec > 0:
        ceiling = min(ceiling, float(session.total_sec))
    capped = int(max(0.0, min(float(max(0, progress_seconds)), ceiling)))

    session.progress_seconds = capped
    session.watched_sec = max(session.watched_sec, capped)  # 서버 측정 시청량(단조 증가)
    if session.total_sec > 0:
        session.progress_pct = max(
            session.progress_pct,
            min(100.0, session.watched_sec / session.total_sec * 100.0),
        )
    session.is_network_unstable = is_network_unstable
    session.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


async def handle_no_response(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID
) -> dict:
    """무반응 이벤트 처리 — 경고 레벨 증가."""
    session = await _find_owned_session(db, user_id, session_id)

    if session.is_network_unstable:
        return {
            "session_id": session.id,
            "warning_level": session.warning_level,
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
        "should_pause": should_pause,
        "no_response_cnt": session.no_response_cnt,
    }


async def resume_session(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> LearningSession:
    """일시 정지된 세션 재개."""
    session = await _find_owned_session(db, user_id, session_id)

    # 완료된 세션은 재개 불가
    if session.status == SessionStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 완료된 세션은 재개할 수 없습니다.",
        )

    # 일시정지 상태가 아닌 경우 무시 (이미 재개됨)
    if not session.is_paused:
        return session

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
        select(LearningSession).where(
            LearningSession.id == session_id,
            LearningSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return session
