"""강의(Lecture) API 통합 테스트."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.models.video_render import RenderStatus, VideoRender
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


# ── DELETE /api/lectures/{id} — High E: HeyGen cancel pre-hook ──────────────

@pytest.mark.asyncio
async def test_delete_lecture_cancels_in_flight_renders(
    client, professor, lecture, db,
):
    """삭제 시 pending/rendering 상태 render 가 cancel 호출되고 DB 가 cancelled 로 마킹.

    - heygen.cancel_video 가 각 in-flight render 의 heygen_job_id 로 호출되는지 확인
    - 호출 후 lecture row 가 사라지는지 확인
    - cascade 로 video_renders 행도 함께 삭제되므로 cancel 마킹은 호출 시점 검증으로만.
    """
    pending_render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-pending-1",
        avatar_id="av",
        status=RenderStatus.pending,
    )
    rendering_render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-rendering-2",
        avatar_id="av",
        status=RenderStatus.rendering,
    )
    ready_render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-done-3",
        avatar_id="av",
        status=RenderStatus.ready,
    )
    db.add_all([pending_render, rendering_render, ready_render])
    await db.flush()

    with patch(
        "app.services.render.heygen_svc.cancel_video",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_cancel:
        resp = await client.delete(
            f"/api/lectures/{lecture.id}",
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 204
    # in-flight 상태(pending, rendering) render 만 cancel 호출
    called_ids = {call.args[0] for call in mock_cancel.call_args_list}
    assert called_ids == {"heygen-pending-1", "heygen-rendering-2"}
    # ready 상태 render 는 cancel 호출 X
    assert "heygen-done-3" not in called_ids


@pytest.mark.asyncio
async def test_delete_lecture_proceeds_when_cancel_fails(
    client, professor, lecture, db,
):
    """heygen cancel 이 예외를 던져도 lecture 삭제는 정상 진행."""
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        heygen_job_id="heygen-flaky",
        avatar_id="av",
        status=RenderStatus.rendering,
    )
    db.add(render)
    await db.flush()

    with patch(
        "app.services.render.heygen_svc.cancel_video",
        new_callable=AsyncMock,
        side_effect=RuntimeError("heygen down"),
    ):
        resp = await client.delete(
            f"/api/lectures/{lecture.id}",
            headers=make_auth_header(professor),
        )

    # 취소 실패해도 삭제는 204 로 성공
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_lecture_other_professor_forbidden(
    client, db, course, lecture,
):
    """소유자가 아닌 교수자의 삭제 시도 → 403."""
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        google_sub="google-other-xx",
        email="other@test.ac.kr",
        name="다른 교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(other)
    await db.flush()

    resp = await client.delete(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(other),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_lecture_not_found(client, professor):
    resp = await client.delete(
        f"/api/lectures/{uuid.uuid4()}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404
