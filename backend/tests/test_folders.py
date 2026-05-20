"""교수자 폴더(컬렉션) API 통합 테스트.

빈 상태(폴더 0개)에서 ``GET /api/folders`` 가 안전하게 ``[]`` 를 반환하는지,
강의가 폴더에 0개 매달려 있을 때 ``lecture_count=0`` 으로 채워지는지 등을
점검한다 — 빈 결과로 인한 None/index 에러 회귀 가드.
"""
import uuid

import pytest
import pytest_asyncio

from app.models.folder import Folder
from app.models.lecture import Lecture
from tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def folder(db, professor):
    f = Folder(
        id=uuid.uuid4(),
        instructor_id=professor.id,
        name="1학기 수업",
        order=0,
    )
    db.add(f)
    await db.flush()
    return f


# ── GET /api/folders ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_folders_empty(client, professor):
    """폴더 0개 — 빈 배열 반환, 500/None 에러 없음."""
    resp = await client.get("/api/folders", headers=make_auth_header(professor))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_folders_with_empty_folder(client, professor, folder):
    """폴더 1개에 강의 0개 — outerjoin 으로 count=0 채워져야 한다."""
    resp = await client.get("/api/folders", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "1학기 수업"
    assert data[0]["lecture_count"] == 0


@pytest.mark.asyncio
async def test_list_folders_with_lectures(client, db, professor, course, folder):
    """폴더에 강의 2개 매달면 lecture_count=2."""
    for i in range(2):
        db.add(
            Lecture(
                id=uuid.uuid4(),
                course_id=course.id,
                folder_id=folder.id,
                title=f"강의 {i}",
                slug=f"lec-{i}-{uuid.uuid4().hex[:8]}",
                order=i,
            )
        )
    await db.flush()

    resp = await client.get("/api/folders", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["lecture_count"] == 2


@pytest.mark.asyncio
async def test_list_folders_isolates_instructor(client, db, professor, student):
    """다른 사용자의 폴더는 보이지 않아야 한다."""
    # 다른 교수자 (실제로는 student 픽스처를 instructor_id 로 빌려 쓴다 —
    # 본 테스트의 목적은 instructor_id 필터 검증이지 role 검증이 아님)
    other = Folder(
        id=uuid.uuid4(),
        instructor_id=student.id,
        name="다른 사람의 폴더",
        order=0,
    )
    db.add(other)
    await db.flush()

    resp = await client.get("/api/folders", headers=make_auth_header(professor))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_folders_requires_auth(client):
    """Authorization 헤더 없으면 401."""
    resp = await client.get("/api/folders")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_folders_student_forbidden(client, student):
    """학습자는 폴더 API 접근 불가 → 403."""
    resp = await client.get("/api/folders", headers=make_auth_header(student))
    assert resp.status_code == 403


# ── POST /api/folders ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_folder_professor(client, professor):
    resp = await client.post(
        "/api/folders",
        headers=make_auth_header(professor),
        json={"name": "신규 폴더", "order": 0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "신규 폴더"
    assert data["instructor_id"] == str(professor.id)
    assert data["lecture_count"] == 0


@pytest.mark.asyncio
async def test_create_folder_student_forbidden(client, student):
    resp = await client.post(
        "/api/folders",
        headers=make_auth_header(student),
        json={"name": "학생 폴더"},
    )
    assert resp.status_code == 403


# ── PATCH /api/folders/{id} ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_folder_rename(client, professor, folder):
    resp = await client.patch(
        f"/api/folders/{folder.id}",
        headers=make_auth_header(professor),
        json={"name": "변경된 이름"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "변경된 이름"


@pytest.mark.asyncio
async def test_patch_folder_not_owned(client, db, professor, student):
    """다른 교수자의 폴더는 수정 불가 → 404 (소유권 검증)."""
    other = Folder(
        id=uuid.uuid4(),
        instructor_id=student.id,
        name="다른 사람의 폴더",
        order=0,
    )
    db.add(other)
    await db.flush()

    resp = await client.patch(
        f"/api/folders/{other.id}",
        headers=make_auth_header(professor),
        json={"name": "탈취"},
    )
    assert resp.status_code == 404


# ── DELETE /api/folders/{id} ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_folder(client, professor, folder):
    resp = await client.delete(
        f"/api/folders/{folder.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 204


# ── PATCH /api/lectures/{id}/folder ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_move_lecture_to_folder(client, db, professor, course, folder):
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title="이동 대상 강의",
        slug=f"move-{uuid.uuid4().hex[:8]}",
        order=0,
    )
    db.add(lec)
    await db.flush()

    resp = await client.patch(
        f"/api/lectures/{lec.id}/folder",
        headers=make_auth_header(professor),
        json={"folder_id": str(folder.id)},
    )
    assert resp.status_code == 200
    assert resp.json()["folder_id"] == str(folder.id)


@pytest.mark.asyncio
async def test_move_lecture_to_uncategorized(
    client, db, professor, course, folder
):
    """folder_id=null 이면 미분류로 풀린다."""
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        folder_id=folder.id,
        title="미분류로 이동",
        slug=f"unc-{uuid.uuid4().hex[:8]}",
        order=0,
    )
    db.add(lec)
    await db.flush()

    resp = await client.patch(
        f"/api/lectures/{lec.id}/folder",
        headers=make_auth_header(professor),
        json={"folder_id": None},
    )
    assert resp.status_code == 200
    assert resp.json()["folder_id"] is None
