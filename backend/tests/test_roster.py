"""수강 명단 — 스펙 15 2단계 (교수자 화면 `/professor/learners` 안).

**왜 명단인가**(§1.2): 종전 "내 학생"은 ``LearningSession → Lecture → Course`` 로
사후 파생됐다. 그래서 **등록만 하고 한 번도 안 본 학생은 존재 자체가 보이지 않았다** —
"미시청 3명"을 특정할 수 없었다(분모가 없었다). 이 화면의 핵심 값은 그 분모다.

검증 축:
1. 명단이 활성·제적을 함께 주는가 (제적을 빼면 "그 학생 어디 갔지"를 못 본다)
2. 미시청(`last_watched_at is None`) 이 드러나는가
3. 남의 강좌 명단이 새지 않는가
4. 제적이 **행 삭제가 아니라 상태 전이**인가
5. 제적을 되돌릴 수 있는가 (학생은 스스로 못 한다)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.course import Course
from app.models.enrollment import (
    ENROLLMENT_ACTIVE,
    ENROLLMENT_WITHDRAWN,
    Enrollment,
)
from app.models.lecture import Lecture
from app.models.session import LearningSession, SessionStatus
from app.models.user import User, UserRole
from app.services import enrollment as enrollment_svc
from tests.conftest import make_auth_header


async def _course(db, professor: User, title: str = "중국어문법의 이해") -> Course:
    course = Course(
        id=uuid.uuid4(), title=title, instructor_id=professor.id, term="2026-2"
    )
    db.add(course)
    await db.flush()
    return course


async def _lecture(db, course: Course) -> Lecture:
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title="1주차",
        slug=f"lec-{uuid.uuid4().hex[:10]}",
        order=1,
        is_published=True,
    )
    db.add(lec)
    await db.flush()
    return lec


async def _student(db, *, name: str, number: str) -> User:
    u = User(
        id=uuid.uuid4(),
        email=f"{number}@kgu.ac.kr",
        name=name,
        role=UserRole.student,
        student_number=number,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


async def _watched(db, student: User, lecture: Lecture, when: datetime) -> None:
    db.add(
        LearningSession(
            id=uuid.uuid4(),
            user_id=student.id,
            lecture_id=lecture.id,
            status=SessionStatus.completed,
            last_active_at=when,
        )
    )
    await db.flush()


# ── 1. 명단 조회 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_roster_lists_active_and_withdrawn(client, db, professor):
    course = await _course(db, professor)
    a = await _student(db, name="김학생", number="202512345")
    b = await _student(db, name="이학생", number="202567890")
    await enrollment_svc.join_course(db, course.id, a.id)
    e_b = await enrollment_svc.join_course(db, course.id, b.id)
    await enrollment_svc.withdraw(db, e_b, withdrawn_by=professor.id)

    resp = await client.get(
        f"/api/v1/enrollments/roster/{course.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["active_count"] == 1
    assert data["withdrawn_count"] == 1
    # 제적자를 목록에서 빼면 "그 학생 어디 갔지"를 확인할 방법이 사라진다.
    assert len(data["entries"]) == 2
    numbers = {e["student_number"] for e in data["entries"]}
    assert numbers == {"202512345", "202567890"}


@pytest.mark.asyncio
async def test_never_watched_student_is_visible(client, db, professor):
    """이 화면이 존재하는 이유 — 세션이 없어도 명단에 나타나야 한다."""
    course = await _course(db, professor)
    lec = await _lecture(db, course)
    watcher = await _student(db, name="본학생", number="202500001")
    idler = await _student(db, name="안본학생", number="202500002")
    await enrollment_svc.join_course(db, course.id, watcher.id)
    await enrollment_svc.join_course(db, course.id, idler.id)
    await _watched(db, watcher, lec, datetime.now(timezone.utc) - timedelta(days=1))

    data = (
        await client.get(
            f"/api/v1/enrollments/roster/{course.id}",
            headers=make_auth_header(professor),
        )
    ).json()

    by_number = {e["student_number"]: e for e in data["entries"]}
    assert by_number["202500001"]["last_watched_at"] is not None
    assert by_number["202500002"]["last_watched_at"] is None
    assert data["never_watched_count"] == 1


@pytest.mark.asyncio
async def test_last_watched_takes_the_most_recent_session(client, db, professor):
    course = await _course(db, professor)
    lec = await _lecture(db, course)
    s = await _student(db, name="김학생", number="202500003")
    await enrollment_svc.join_course(db, course.id, s.id)
    old = datetime.now(timezone.utc) - timedelta(days=10)
    recent = datetime.now(timezone.utc) - timedelta(hours=2)
    await _watched(db, s, lec, old)
    await _watched(db, s, lec, recent)

    data = (
        await client.get(
            f"/api/v1/enrollments/roster/{course.id}",
            headers=make_auth_header(professor),
        )
    ).json()
    got = datetime.fromisoformat(data["entries"][0]["last_watched_at"])
    # SQLite 는 tz 를 보존하지 않는다(운영 Postgres 는 aware). 비교 전에 맞춘다.
    if got.tzinfo is None:
        got = got.replace(tzinfo=timezone.utc)
    assert abs((got - recent).total_seconds()) < 2


@pytest.mark.asyncio
async def test_other_lecture_sessions_do_not_leak_into_last_watched(
    client, db, professor
):
    """다른 강좌 시청이 이 강좌의 '최근 시청'으로 잡히면 미시청자를 놓친다."""
    course = await _course(db, professor)
    other = await _course(db, professor, title="다른 강좌")
    other_lec = await _lecture(db, other)
    s = await _student(db, name="김학생", number="202500004")
    await enrollment_svc.join_course(db, course.id, s.id)
    await _watched(db, s, other_lec, datetime.now(timezone.utc))

    data = (
        await client.get(
            f"/api/v1/enrollments/roster/{course.id}",
            headers=make_auth_header(professor),
        )
    ).json()
    assert data["entries"][0]["last_watched_at"] is None


# ── 2. 소유권 ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_other_professors_course_roster_is_404(client, db, professor):
    """남의 강좌 명단은 학생 개인정보다 — 존재 여부도 알려주지 않는다."""
    stranger = User(
        id=uuid.uuid4(),
        email="stranger@kgu.ac.kr",
        name="타교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(stranger)
    await db.flush()
    course = await _course(db, stranger, title="남의 강좌")

    resp = await client.get(
        f"/api/v1/enrollments/roster/{course.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_student_cannot_read_roster(client, db, professor, student):
    course = await _course(db, professor)
    resp = await client.get(
        f"/api/v1/enrollments/roster/{course.id}",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── 3. 제적 ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_withdraw_keeps_the_row(client, db, professor):
    """행을 지우면 이미 쌓인 세션·평가가 주인을 잃는다(스펙 15 §3.1)."""
    course = await _course(db, professor)
    s = await _student(db, name="김학생", number="202500005")
    enrollment = await enrollment_svc.join_course(db, course.id, s.id)

    resp = await client.post(
        f"/api/v1/enrollments/{enrollment.id}/withdraw",
        headers=make_auth_header(professor),
        json={"note": "수강 철회"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == ENROLLMENT_WITHDRAWN

    row = (
        await db.execute(select(Enrollment).where(Enrollment.id == enrollment.id))
    ).scalar_one()
    assert row.status == ENROLLMENT_WITHDRAWN
    assert row.withdrawn_by == professor.id
    assert row.note == "수강 철회"


@pytest.mark.asyncio
async def test_withdraw_response_keeps_last_watched(client, db, professor):
    """제적 버튼 한 번에 그 학생이 '한 번도 안 봄'으로 바뀌면 안 된다."""
    course = await _course(db, professor)
    lec = await _lecture(db, course)
    s = await _student(db, name="김학생", number="202500006")
    enrollment = await enrollment_svc.join_course(db, course.id, s.id)
    await _watched(db, s, lec, datetime.now(timezone.utc) - timedelta(hours=3))

    resp = await client.post(
        f"/api/v1/enrollments/{enrollment.id}/withdraw",
        headers=make_auth_header(professor),
    )
    assert resp.json()["last_watched_at"] is not None


@pytest.mark.asyncio
async def test_cannot_withdraw_from_another_professors_course(client, db, professor):
    stranger = User(
        id=uuid.uuid4(),
        email="stranger2@kgu.ac.kr",
        name="타교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(stranger)
    await db.flush()
    course = await _course(db, stranger, title="남의 강좌")
    s = await _student(db, name="김학생", number="202500007")
    enrollment = await enrollment_svc.join_course(db, course.id, s.id)

    resp = await client.post(
        f"/api/v1/enrollments/{enrollment.id}/withdraw",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reactivate_restores_the_same_row(client, db, professor):
    """학생은 스스로 복구할 수 없다(§4.2) — 되돌리는 경로가 화면에 없으면
    오조작 한 번이 그 학생을 학기 내내 잠근다."""
    course = await _course(db, professor)
    s = await _student(db, name="김학생", number="202500008")
    enrollment = await enrollment_svc.join_course(db, course.id, s.id)
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)

    resp = await client.post(
        f"/api/v1/enrollments/{enrollment.id}/reactivate",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == ENROLLMENT_ACTIVE
    # UNIQUE(course_id, student_id) — 새 행이 아니라 같은 행의 상태 전이다.
    rows = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course.id, Enrollment.student_id == s.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].id == enrollment.id


@pytest.mark.asyncio
async def test_reactivated_student_can_join_again(client, db, professor):
    """재등록 후에는 링크 재진입이 다시 통과해야 한다."""
    course = await _course(db, professor)
    s = await _student(db, name="김학생", number="202500009")
    enrollment = await enrollment_svc.join_course(db, course.id, s.id)
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)
    await client.post(
        f"/api/v1/enrollments/{enrollment.id}/reactivate",
        headers=make_auth_header(professor),
    )

    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(s),
        json={"course_slug": course.slug},
    )
    assert resp.status_code == 200, resp.text


# ── 4. 교수자 미리보기 (`/c/[slug]`) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_course_marks_owner(client, db, professor):
    """교수는 QR 을 띄우기 전에 본인이 먼저 스캔해 본다 — 그때 깨지면 배포를 포기한다."""
    course = await _course(db, professor)
    await _lecture(db, course)

    data = (
        await client.get(
            f"/api/courses/public/{course.slug}",
            headers=make_auth_header(professor),
        )
    ).json()
    assert data["is_owner"] is True


@pytest.mark.asyncio
async def test_public_course_owner_sees_the_same_list_as_students(
    client, db, professor
):
    """미발행 강의를 끼워 주면 "학생에게 이렇게 보입니다"가 거짓말이 된다."""
    course = await _course(db, professor)
    await _lecture(db, course)
    db.add(
        Lecture(
            id=uuid.uuid4(),
            course_id=course.id,
            title="작업중",
            slug=f"lec-{uuid.uuid4().hex[:10]}",
            order=2,
            is_published=False,
        )
    )
    await db.flush()

    data = (
        await client.get(
            f"/api/courses/public/{course.slug}",
            headers=make_auth_header(professor),
        )
    ).json()
    assert [lec["title"] for lec in data["lectures"]] == ["1주차"]


@pytest.mark.asyncio
async def test_public_course_anonymous_is_not_owner(client, db, professor):
    course = await _course(db, professor)
    data = (await client.get(f"/api/courses/public/{course.slug}")).json()
    assert data["is_owner"] is False


@pytest.mark.asyncio
async def test_public_course_other_professor_is_not_owner(client, db, professor):
    stranger = User(
        id=uuid.uuid4(),
        email="stranger3@kgu.ac.kr",
        name="타교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(stranger)
    await db.flush()
    course = await _course(db, stranger, title="남의 강좌")

    data = (
        await client.get(
            f"/api/courses/public/{course.slug}",
            headers=make_auth_header(professor),
        )
    ).json()
    assert data["is_owner"] is False
