"""집중도 모니터링 API 통합 테스트."""
import uuid
from datetime import datetime, timezone

import pytest

from app.models.session import LearningSession, SessionStatus


# ── 집중도 추적 시작 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_attention_tracking(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/start",
        params={
            "session_id": str(session.id),
            "user_id": str(student.id),
            "lecture_id": str(lecture.id),
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == str(session.id)
    assert "warning_level" in data


# ── 하트비트 ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heartbeat(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        last_heartbeat_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/heartbeat",
        params={
            "session_id": str(session.id),
            "progress_seconds": 120,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress_seconds"] == 120


@pytest.mark.asyncio
async def test_heartbeat_network_unstable(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        last_heartbeat_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/heartbeat",
        params={
            "session_id": str(session.id),
            "progress_seconds": 120,
            "is_network_unstable": True,
        },
    )
    assert resp.status_code == 200


# ── 무반응 이벤트 ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_response(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/no-response",
        params={"session_id": str(session.id)},
    )
    assert resp.status_code == 200


# ── 세션 재개 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resume_session(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        is_paused=True,
        warning_level=1,
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/resume",
        params={"session_id": str(session.id)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "영상이 재개되었습니다."
    assert data["is_paused"] is False
