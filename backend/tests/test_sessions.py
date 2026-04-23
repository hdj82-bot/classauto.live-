"""세션 관리 API 통합 테스트."""
import uuid

import pytest

from app.models.session import LearningSession, SessionStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ── 세션 생성 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_session(client, student, lecture):
    resp = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("not_started", "in_progress")
    assert "id" in data


@pytest.mark.asyncio
async def test_create_session_professor_forbidden(client, professor, lecture):
    resp = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_session_unauthorized(client, lecture):
    resp = await client.post(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id), "total_sec": 600},
    )
    assert resp.status_code in (401, 403)


# ── 세션 상태 업데이트 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_session_status(client, student, lecture, db):
    # 세션 생성
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.not_started,
        total_sec=600,
    )
    db.add(session)
    await db.flush()

    # not_started → in_progress
    resp = await client.patch(
        f"/api/v1/sessions/{session.id}",
        params={"status": "in_progress"},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_session_invalid_transition(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.not_started,
        total_sec=600,
    )
    db.add(session)
    await db.flush()

    # not_started → completed (허용되지 않는 전이)
    resp = await client.patch(
        f"/api/v1/sessions/{session.id}",
        params={"status": "completed"},
        headers=make_auth_header(student),
    )
    assert resp.status_code in (400, 422)


# ── 세션 완료 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_complete_session(client, student, lecture, db):
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
        f"/api/v1/sessions/{session.id}/complete",
        params={"watched_sec": 580},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


# ── 세션 조회 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_session(client, student, lecture, db):
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
        watched_sec=120,
    )
    db.add(session)
    await db.flush()

    resp = await client.get(
        f"/api/v1/sessions/{session.id}",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_sessions(client, student, lecture, db):
    for i in range(3):
        db.add(LearningSession(
            id=uuid.uuid4(),
            user_id=student.id,
            lecture_id=lecture.id,
            status=SessionStatus.in_progress,
            total_sec=600,
        ))
    await db.flush()

    resp = await client.get(
        "/api/v1/sessions",
        params={"lecture_id": str(lecture.id)},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_session_other_user_returns_404(client, student, lecture, db):
    """타인의 세션 ID로 조회 시 404 반환 — 존재 여부 노출 방지."""
    from app.models.user import UserRole

    # 세션 소유자: student
    session = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        total_sec=600,
    )
    db.add(session)

    # 다른 학생
    other_student = User(
        id=uuid.uuid4(),
        google_sub="google-stu-other",
        email="other@test.ac.kr",
        name="다른 학생",
        role=UserRole.student,
        school="한국대학교",
        department="전자공학과",
        student_number="20240099",
        is_active=True,
    )
    db.add(other_student)
    await db.flush()

    resp = await client.get(
        f"/api/v1/sessions/{session.id}",
        headers=make_auth_header(other_student),
    )
    # 403이 아닌 404 — 세션 존재 여부를 타인에게 노출하지 않음
    assert resp.status_code == 404
