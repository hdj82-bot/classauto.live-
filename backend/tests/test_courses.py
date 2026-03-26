"""강좌(Course) API 통합 테스트."""
import pytest

from tests.conftest import make_auth_header


# ── GET /api/courses ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_courses_empty(client, professor):
    resp = await client.get("/api/courses", headers=make_auth_header(professor))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_courses_with_data(client, professor, course):
    resp = await client.get("/api/courses", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "통합테스트 강좌"


@pytest.mark.asyncio
async def test_list_courses_student_sees_active(client, student, course):
    """학습자도 활성 강좌는 조회 가능."""
    resp = await client.get("/api/courses", headers=make_auth_header(student))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ── POST /api/courses ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_course_professor(client, professor):
    resp = await client.post(
        "/api/courses",
        headers=make_auth_header(professor),
        json={"title": "신규 강좌", "description": "설명입니다"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "신규 강좌"
    assert data["instructor_id"] == str(professor.id)


@pytest.mark.asyncio
async def test_create_course_student_forbidden(client, student):
    """학습자는 강좌 생성 불가 → 403."""
    resp = await client.post(
        "/api/courses",
        headers=make_auth_header(student),
        json={"title": "학생강좌"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_course_missing_title(client, professor):
    """제목 없이 생성 시도 → 422."""
    resp = await client.post(
        "/api/courses",
        headers=make_auth_header(professor),
        json={"description": "제목없음"},
    )
    assert resp.status_code == 422
