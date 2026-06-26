"""부정행위 방지 서버측 이전(C2) 테스트.

진행률·완료를 클라이언트 보고 대신 서버가 잰 경과 실시간·하트비트로만 인정하고,
같은 user+lecture 의 동시 활성 세션을 제한하는 동작을 검증한다.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.session import LearningSession, SessionStatus
from tests.conftest import make_auth_header


def _utcnow():
    return datetime.now(timezone.utc)


# ── 동시 재생 제한 ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_session_limit(client, student, lecture):
    """같은 user+lecture 의 두 번째 활성 세션 생성은 409 로 거부된다."""
    first = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
        headers=make_auth_header(student),
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
        headers=make_auth_header(student),
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_completed_session_does_not_block_new(client, student, lecture, db):
    """완료된 세션은 활성으로 치지 않으므로 새 세션 생성이 가능하다."""
    done = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.completed,
        total_sec=600,
        watched_sec=600,
        started_at=_utcnow() - timedelta(seconds=600),
    )
    db.add(done)
    await db.flush()

    resp = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200


# ── 완료: 클라 100% 무조건 신뢰 제거 ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_complete_rejected_without_elapsed(client, student, lecture, db):
    """경과 실시간이 거의 없으면(즉시 완료 시도) 클라가 watched_sec=total 을
    보고해도 완료가 거부(409)된다."""
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        started_at=_utcnow(),  # 방금 시작 — 경과 ≈ 0
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        f"/api/v1/sessions/{session.id}/complete",
        params={"watched_sec": 600},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_complete_allowed_after_elapsed(client, student, lecture, db):
    """충분한 경과 실시간이 지나면 완료가 인정되고 progress_pct=100 이 된다."""
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        started_at=_utcnow() - timedelta(seconds=600),
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        f"/api/v1/sessions/{session.id}/complete",
        params={"watched_sec": 590},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["progress_pct"] == 100.0


# ── 진행률: 클라 보고 미신뢰, watched_sec 상한 ───────────────────────────────

@pytest.mark.asyncio
async def test_update_caps_watched_sec_to_elapsed(client, student, lecture, db):
    """PATCH 로 비현실적으로 큰 watched_sec 를 보고해도 서버 경과 실시간 상한으로
    깎이고, progress_pct 는 깎인 시청량으로 재산출된다(클라 100% 미신뢰)."""
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        started_at=_utcnow() - timedelta(seconds=30),  # 30초만 경과
    )
    db.add(session)
    await db.flush()

    # 경과 30초 → 상한 ≈ 30*2 + 5 = 65초. 600 보고해도 65 근처로 깎인다.
    resp = await client.patch(
        f"/api/v1/sessions/{session.id}",
        params={"status": "in_progress", "watched_sec": 600, "progress_pct": 100},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200

    await db.refresh(session)
    assert session.watched_sec <= 70
    assert session.progress_pct < 100.0


@pytest.mark.asyncio
async def test_heartbeat_caps_inflated_progress(client, student, lecture, db):
    """하트비트로 부풀린 progress_seconds 를 보고해도 서버 경과 실시간 상한으로
    깎여 반환된다."""
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        started_at=_utcnow() - timedelta(seconds=20),
        last_heartbeat_at=_utcnow(),
    )
    db.add(session)
    await db.flush()

    resp = await client.post(
        "/api/v1/attention/heartbeat",
        params={"session_id": str(session.id), "progress_seconds": 99999},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    # 상한 ≈ 20*2 + 5 = 45초. 99999 가 그대로 들어가지 않는다.
    assert resp.json()["progress_seconds"] <= 60
