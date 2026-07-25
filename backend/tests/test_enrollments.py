"""수강 등록 통합 테스트 — 스펙 15 1단계.

검증 대상:
1. 등록은 전용 진입점(`POST /enrollments/join`)에서만 생기고 **멱등**하다.
2. 제적된 학생은 링크로 되살아나지 않는다(403) — 자동 복구되면 제적이 무의미.
3. **세션 시작은 활성 등록을 요구한다** — `lecture_id` 만 알면 아무나 시작하던
   구멍(스펙 15 §1.3)이 닫혔는지가 이 파일의 핵심 회귀 가드다.
"""
from __future__ import annotations

import uuid

import pytest

from app.models.course import Course
from app.models.enrollment import ENROLLMENT_WITHDRAWN, Enrollment
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.services import enrollment as enrollment_svc
from tests.conftest import make_auth_header


@pytest.fixture
def other_student_factory(db):
    """같은 강좌에 등록되지 않은 제3의 학생(= 링크만 아는 타 학교 학생)."""

    async def _make() -> User:
        user = User(
            id=uuid.uuid4(),
            google_sub=f"google-outsider-{uuid.uuid4().hex[:8]}",
            email=f"outsider-{uuid.uuid4().hex[:6]}@other.ac.kr",
            name="외부 학생",
            role=UserRole.student,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user

    return _make


# ── 등록 진입점 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_join_by_lecture_slug_creates_enrollment(
    client, db, student: User, lecture: Lecture, course: Course
):
    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"lecture_slug": lecture.slug},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["course_id"] == str(course.id)
    assert data["status"] == "active"
    assert data["source"] == "link"


@pytest.mark.asyncio
async def test_join_by_course_id_creates_enrollment(
    client, student: User, course: Course
):
    """`/c/[slug]` 경로 — courses.slug 가 생기기 전까지는 강좌 UUID 를 받는다."""
    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"course_slug": str(course.id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["course_id"] == str(course.id)


@pytest.mark.asyncio
async def test_join_is_idempotent(client, student: User, lecture: Lecture):
    """새로고침·두 탭에서도 안전해야 한다 — 같은 등록이 그대로 반환된다."""
    payload = {"lecture_slug": lecture.slug}
    first = await client.post(
        "/api/v1/enrollments/join", headers=make_auth_header(student), json=payload
    )
    second = await client.post(
        "/api/v1/enrollments/join", headers=make_auth_header(student), json=payload
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_join_unknown_slug_404(client, student: User):
    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"lecture_slug": "does-not-exist"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_join_requires_one_identifier(client, student: User):
    resp = await client.post(
        "/api/v1/enrollments/join", headers=make_auth_header(student), json={}
    )
    assert resp.status_code == 422


# ── 제적 ───────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_withdrawn_student_cannot_rejoin_via_link(
    client, db, student: User, professor: User, lecture: Lecture, course: Course
):
    """제적된 학생이 링크로 다시 들어오면 403. 자동 복구되면 제적이 무의미하다."""
    enrollment = await enrollment_svc.join_course(db, course.id, student.id)
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)

    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"lecture_slug": lecture.slug},
    )
    assert resp.status_code == 403
    # 학생이 취할 행동이 다르므로 미등록과 문구가 구분돼야 한다.
    assert "수강이 종료" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_withdraw_keeps_row_and_records_actor(
    db, student: User, professor: User, course: Course
):
    """제적은 행 삭제가 아니다 — 세션·평가 결과가 주인을 잃으면 안 된다."""
    enrollment = await enrollment_svc.join_course(db, course.id, student.id)
    await enrollment_svc.withdraw(
        db, enrollment, withdrawn_by=professor.id, note="수강 철회"
    )

    stored = await enrollment_svc.get_enrollment(db, course.id, student.id)
    assert stored is not None  # 행이 남아 있다
    assert stored.status == ENROLLMENT_WITHDRAWN
    assert stored.withdrawn_at is not None
    assert stored.withdrawn_by == professor.id
    assert stored.note == "수강 철회"


@pytest.mark.asyncio
async def test_reactivate_reuses_same_row(
    db, student: User, professor: User, course: Course
):
    """재등록은 새 행이 아니라 같은 행의 상태 전이다(UNIQUE 제약)."""
    enrollment = await enrollment_svc.join_course(db, course.id, student.id)
    original_id = enrollment.id
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)
    await enrollment_svc.reactivate(db, enrollment)

    stored = await enrollment_svc.get_enrollment(db, course.id, student.id)
    assert stored is not None
    assert stored.id == original_id  # 이력이 한 줄에 모인다
    assert stored.status == "active"
    assert stored.withdrawn_at is None
    assert stored.withdrawn_by is None


# ── 세션 시작 게이트 (스펙 15 §1.3 구멍 차단) ───────────────────────────────────


@pytest.mark.asyncio
async def test_session_start_requires_active_enrollment(
    client, db, other_student_factory, lecture: Lecture
):
    """**핵심 회귀 가드** — lecture_id 만 아는 미등록 학생은 세션을 시작할 수 없다.

    종전에는 `require_student` 만 봐서 타 학교 학생도 시청·퀴즈·질문이 됐다.
    """
    outsider = await other_student_factory()
    resp = await client.post(
        f"/api/v1/sessions?lecture_id={lecture.id}&total_sec=600",
        headers=make_auth_header(outsider),
    )
    assert resp.status_code == 403
    assert "등록되지 않았습니다" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_session_start_allowed_after_join(
    client, student: User, lecture: Lecture
):
    """등록 진입점을 통과하면 정상적으로 세션이 시작된다."""
    join = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"lecture_slug": lecture.slug},
    )
    assert join.status_code == 200

    resp = await client.post(
        f"/api/v1/sessions?lecture_id={lecture.id}&total_sec=600",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200, resp.text
    # create_session 은 곧바로 in_progress 로 연다(not_started 는 초기 기본값일 뿐).
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_withdrawn_student_cannot_start_session(
    client, db, student: User, professor: User, lecture: Lecture, course: Course
):
    """제적 후에는 이미 알고 있던 lecture_id 로도 시청할 수 없다."""
    enrollment = await enrollment_svc.join_course(db, course.id, student.id)
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)

    resp = await client.post(
        f"/api/v1/sessions?lecture_id={lecture.id}&total_sec=600",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403
    assert "수강이 종료" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_my_enrollments_lists_own_rows(
    client, db, student: User, lecture: Lecture, course: Course
):
    await enrollment_svc.join_course(db, course.id, student.id)
    resp = await client.get(
        "/api/v1/enrollments/me", headers=make_auth_header(student)
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["course_id"] == str(course.id)


# ── courses.term ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_course_term_defaults_to_null_and_is_settable(db, professor: User):
    """학기 필드는 nullable — 기존 행은 NULL 로 남기고 추정 백필하지 않는다."""
    course = Course(
        id=uuid.uuid4(),
        title="중국어문법의 이해",
        instructor_id=professor.id,
    )
    db.add(course)
    await db.flush()
    assert course.term is None

    course.term = "2026-2"
    await db.flush()
    assert course.term == "2026-2"


@pytest.mark.asyncio
async def test_enrollment_section_label_is_optional(db, student: User, course: Course):
    """분반은 Course 를 쪼개지 않고 라벨로 둔다 — 같은 영상을 공유하기 위함."""
    enrollment = Enrollment(
        id=uuid.uuid4(),
        course_id=course.id,
        student_id=student.id,
        section="01",
    )
    db.add(enrollment)
    await db.flush()
    assert enrollment.section == "01"
    assert enrollment.status == "active"
