"""Course 단위 학생 진입 — 스펙 15 2단계 (`/c/[slug]`).

**왜 강좌 단위인가**(§1.1): 종전 `/v/[slug]` 는 강의 단위라 12주차 수업이면 링크도 QR 도
12개고 교수자가 매주 새로 뿌려야 했다. 매주 배포가 곧 매주의 이탈 지점이다. 학기 초
Course QR 1회로 끝내려면 강좌에 안정적인 주소가 필요하다.

검증 축:
1. `courses.slug` 가 생성 시 부여되고 유일한가
2. 공개 조회가 **발행 강의만** 주고 만료를 표시하는가 (인증 불필요)
3. `join` 이 slug 로 강좌를 찾는가 — 1단계의 UUID 호환도 유지하는가
4. 제적 학생은 자동 복구되지 않는가
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User
from app.services import enrollment as enrollment_svc
from tests.conftest import make_auth_header


async def _make_course(db, professor: User, *, title: str = "중국어문법의 이해") -> Course:
    # slug 를 일부러 넘기지 않는다 — 모델 기본값이 부여한다는 것 자체가 검증 대상이다.
    course = Course(
        id=uuid.uuid4(),
        title=title,
        instructor_id=professor.id,
        term="2026-2",
        is_published=True,
    )
    db.add(course)
    await db.flush()
    return course


async def _make_lecture(
    db,
    course: Course,
    *,
    title: str,
    published: bool = True,
    expires_at: datetime | None = None,
    order: int = 1,
) -> Lecture:
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title=title,
        slug=f"lec-{uuid.uuid4().hex[:10]}",
        order=order,
        is_published=published,
        expires_at=expires_at,
    )
    db.add(lec)
    await db.flush()
    return lec


# ── 1. slug 생성 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_created_course_gets_slug(client, db, professor):
    resp = await client.post(
        "/api/courses",
        headers=make_auth_header(professor),
        json={"title": "把자문 집중 강좌", "description": "3주 과정"},
    )
    assert resp.status_code in (200, 201), resp.text

    from sqlalchemy import select

    course = (
        await db.execute(select(Course).where(Course.title == "把자문 집중 강좌"))
    ).scalar_one()
    assert course.slug
    # 강의와 같은 규칙 — UUID 8자리 접미사로 유일성을 보장한다.
    assert course.slug.endswith(course.slug.rsplit("-", 1)[-1])
    assert len(course.slug.rsplit("-", 1)[-1]) == 8


@pytest.mark.asyncio
async def test_slug_is_assigned_without_the_service_layer(db, professor):
    """slug 없는 강좌는 학생이 도달할 수 없다 — 생성 경로가 아니라 모델이 책임진다."""
    course = Course(id=uuid.uuid4(), title="시드로 만든 강좌", instructor_id=professor.id)
    db.add(course)
    await db.flush()
    assert course.slug.startswith("시드로-만든-강좌-")


@pytest.mark.asyncio
async def test_symbol_only_title_still_yields_a_usable_slug(db, professor):
    """제목이 기호뿐이어도 앞이 하이픈인 주소가 나오면 안 된다(붙여넣을 때 잘린다)."""
    course = Course(id=uuid.uuid4(), title="!!!", instructor_id=professor.id)
    db.add(course)
    await db.flush()
    assert course.slug.startswith("course-")


@pytest.mark.asyncio
async def test_same_title_produces_different_slugs(db, professor):
    a = await _make_course(db, professor, title="같은 제목")
    b = await _make_course(db, professor, title="같은 제목")
    assert a.slug != b.slug


# ── 2. 공개 조회 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_course_needs_no_auth(client, db, professor):
    """학생이 로그인 **전에** 무슨 강좌인지 보고 판단해야 한다."""
    course = await _make_course(db, professor)
    await _make_lecture(db, course, title="1주차")

    resp = await client.get(f"/api/courses/public/{course.slug}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["title"] == "중국어문법의 이해"
    assert data["term"] == "2026-2"
    assert data["lecture_count"] == 1


@pytest.mark.asyncio
async def test_unpublished_lectures_excluded(client, db, professor):
    course = await _make_course(db, professor)
    await _make_lecture(db, course, title="발행됨", published=True, order=1)
    await _make_lecture(db, course, title="작업중", published=False, order=2)

    data = (await client.get(f"/api/courses/public/{course.slug}")).json()
    titles = [lec["title"] for lec in data["lectures"]]
    assert titles == ["발행됨"]


@pytest.mark.asyncio
async def test_expired_lecture_is_marked_not_hidden(client, db, professor):
    """사라지면 학생이 "내 강의가 없어졌다"고 문의한다 — 표시만 한다."""
    course = await _make_course(db, professor)
    await _make_lecture(
        db, course, title="만료됨",
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )

    data = (await client.get(f"/api/courses/public/{course.slug}")).json()
    assert len(data["lectures"]) == 1
    assert data["lectures"][0]["is_expired"] is True
    # 발행 강의가 전부 만료면 강좌 자체가 끝난 것으로 본다.
    assert data["is_expired"] is True


@pytest.mark.asyncio
async def test_course_not_expired_when_any_lecture_alive(client, db, professor):
    course = await _make_course(db, professor)
    await _make_lecture(
        db, course, title="만료됨", order=1,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    await _make_lecture(db, course, title="살아있음", order=2)

    data = (await client.get(f"/api/courses/public/{course.slug}")).json()
    assert data["is_expired"] is False


@pytest.mark.asyncio
async def test_unknown_slug_404(client):
    resp = await client.get("/api/courses/public/does-not-exist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_course_exposes_no_student_data(client, db, professor):
    """등록 학생 정보가 인증 없는 응답에 새면 안 된다."""
    course = await _make_course(db, professor)
    await _make_lecture(db, course, title="1주차")

    body = (await client.get(f"/api/courses/public/{course.slug}")).text
    for leaked in ("student", "enrollment", "email"):
        assert leaked not in body.lower()


# ── 3. join 이 slug 를 해석 ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_join_by_course_slug(client, db, student, professor):
    course = await _make_course(db, professor)

    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"course_slug": course.slug},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["course_id"] == str(course.id)


@pytest.mark.asyncio
async def test_join_still_accepts_course_uuid(client, db, student, professor):
    """1단계에서 만들어진 링크가 깨지면 안 된다 — UUID 도 계속 받는다."""
    course = await _make_course(db, professor)

    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"course_slug": str(course.id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["course_id"] == str(course.id)


@pytest.mark.asyncio
async def test_join_is_idempotent_by_slug(client, db, student, professor):
    """재진입해도 중복 등록·에러가 없어야 한다."""
    course = await _make_course(db, professor)
    payload = {"course_slug": course.slug}

    first = await client.post(
        "/api/v1/enrollments/join", headers=make_auth_header(student), json=payload
    )
    second = await client.post(
        "/api/v1/enrollments/join", headers=make_auth_header(student), json=payload
    )
    assert first.json()["id"] == second.json()["id"]


# ── 4. 제적 학생 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_withdrawn_student_not_auto_restored(
    client, db, student, professor
):
    """자동 복구되면 제적이 아무 의미가 없다. 조용히 실패해서도 안 된다."""
    course = await _make_course(db, professor)
    enrollment = await enrollment_svc.join_course(db, course.id, student.id)
    await enrollment_svc.withdraw(db, enrollment, withdrawn_by=professor.id)

    resp = await client.post(
        "/api/v1/enrollments/join",
        headers=make_auth_header(student),
        json={"course_slug": course.slug},
    )
    assert resp.status_code == 403
    # 학생이 취할 행동(교수님께 문의)이 문구에 있어야 한다.
    assert "수강이 종료" in resp.json()["detail"]
