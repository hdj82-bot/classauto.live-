"""강의(Lecture) API 통합 테스트."""
import pytest

from tests.conftest import make_auth_header


# ── GET /api/courses/{id}/lectures ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_lectures(client, professor, course, lecture):
    resp = await client.get(
        f"/api/courses/{course.id}/lectures",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "통합테스트 강의"


@pytest.mark.asyncio
async def test_list_lectures_unknown_course(client, professor):
    import uuid
    resp = await client.get(
        f"/api/courses/{uuid.uuid4()}/lectures",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_student_sees_only_published(client, student, course, lecture):
    """학습자는 게시된 강의만 조회."""
    resp = await client.get(
        f"/api/courses/{course.id}/lectures",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    data = resp.json()
    # fixture lecture는 is_published=True
    assert len(data) == 1


# ── POST /api/lectures ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_lecture(client, professor, course):
    resp = await client.post(
        "/api/lectures",
        headers=make_auth_header(professor),
        json={
            "course_id": str(course.id),
            "title": "새 강의",
            "order": 2,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "새 강의"
    assert "slug" in data


@pytest.mark.asyncio
async def test_create_lecture_other_professor_forbidden(client, db, course):
    """다른 교수자 소유 강좌에 강의 생성 → 403."""
    import uuid
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        google_sub="other-prof",
        email="other@test.ac.kr",
        name="다른교수",
        role=UserRole.professor,
        school="다른대학교",
        is_active=True,
    )
    db.add(other)
    await db.flush()

    resp = await client.post(
        "/api/lectures",
        headers=make_auth_header(other),
        json={"course_id": str(course.id), "title": "침범강의", "order": 99},
    )
    assert resp.status_code == 403


# ── PATCH /api/lectures/{id} ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_lecture(client, professor, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"title": "수정된 강의 제목", "is_published": False},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "수정된 강의 제목"


@pytest.mark.asyncio
async def test_update_lecture_student_forbidden(client, student, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(student),
        json={"title": "학생수정시도"},
    )
    assert resp.status_code == 403


# ── GET /api/lectures/{slug}/public ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_public_lecture(client, lecture):
    """인증 없이 slug로 공개 강의 조회."""
    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == lecture.slug
    assert "correct_answer" not in str(data)  # 정답 미포함 확인


@pytest.mark.asyncio
async def test_public_lecture_not_found(client):
    resp = await client.get("/api/lectures/nonexistent-slug-9999/public")
    assert resp.status_code == 404
