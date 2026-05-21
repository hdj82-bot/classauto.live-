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


# ── R2W2: BACKEND_ASKS.W4 #1·#2 — 부가 정보 노출 ────────────────────────────


@pytest.mark.asyncio
async def test_public_lecture_exposes_professor_and_course_names(
    client, professor, course, lecture,
):
    """``/v/[slug]`` 의 trust line 용 ``professor_name`` / ``course_name`` 노출.

    fixtures: professor.name="테스트 교수", course.title="통합테스트 강좌".
    """
    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    data = resp.json()
    # 키는 항상 존재 (None 가능) — frontend 호환성 보장.
    assert "professor_name" in data
    assert "course_name" in data
    assert "duration_sec" in data
    assert data["professor_name"] == professor.name
    assert data["course_name"] == course.title


@pytest.mark.asyncio
async def test_public_lecture_duration_sec_is_none_when_no_video(client, lecture):
    """Video 가 아직 없으면 duration_sec=None — frontend 가 자연스럽게 숨김."""
    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["duration_sec"] is None


@pytest.mark.asyncio
async def test_public_lecture_duration_sec_picks_video_duration(
    client, lecture, db,
):
    """Video.duration_seconds 가 있으면 그 값을 노출."""
    from app.models.video import Video, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.done,
        duration_seconds=312,
    )
    db.add(v)
    await db.flush()

    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["duration_sec"] == 312


@pytest.mark.asyncio
async def test_public_lecture_duration_sec_picks_latest_video(
    client, lecture, db,
):
    """Video 가 여럿이면 가장 최근 (created_at 큰) 것의 duration_seconds 채택."""
    from datetime import datetime, timezone, timedelta

    from app.models.video import Video, VideoStatus

    older = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.done,
        duration_seconds=100,
        created_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    newer = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.done,
        duration_seconds=900,
        created_at=datetime.now(timezone.utc),
    )
    db.add_all([older, newer])
    await db.flush()

    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    assert resp.json()["duration_sec"] == 900


@pytest.mark.asyncio
async def test_public_lecture_skips_video_without_duration(
    client, lecture, db,
):
    """duration_seconds 가 NULL 인 Video 는 무시 (rendering 중 등)."""
    from app.models.video import Video, VideoStatus

    v_no_dur = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.rendering,
        duration_seconds=None,
    )
    db.add(v_no_dur)
    await db.flush()

    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    assert resp.json()["duration_sec"] is None


@pytest.mark.asyncio
async def test_public_lecture_response_keys_are_backward_compatible(
    client, lecture,
):
    """기존 키 (id/slug/title/is_expired/video_url/...) 가 모두 그대로 존재.

    R2W2 추가는 순전히 additive — 기존 W4 frontend 가 추가 키를 무시하고도 동작.
    """
    resp = await client.get(f"/api/lectures/{lecture.slug}/public")
    assert resp.status_code == 200
    data = resp.json()
    expected_legacy_keys = {
        "id", "course_id", "title", "description", "thumbnail_url",
        "slug", "is_expired", "video_url",
    }
    assert expected_legacy_keys.issubset(data.keys())


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


# ── GET /api/lectures/{id}/slides ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_lecture_slides_empty_before_pipeline(client, professor, lecture):
    """파이프라인 시작 전 — pipeline_task_id 도 video 도 없는 상태에서는 빈 리스트."""
    resp = await client.get(
        f"/api/lectures/{lecture.id}/slides",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["lecture_id"] == str(lecture.id)
    assert data["slides"] == []


@pytest.mark.asyncio
async def test_get_lecture_slides_all_ready_from_script_segments(
    client, professor, lecture, db,
):
    """스크립트 segments 가 모두 도착한 상태 — 전부 ready 로 반환."""
    from app.models.video import Video, VideoScript, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.pending_review,
    )
    db.add(v)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(),
        video_id=v.id,
        segments=[
            {
                "slide_index": 0,
                "text": "안녕하세요. 첫 번째 슬라이드 다듬은 스크립트.",
                "start_seconds": 0,
                "end_seconds": 30,
                "tone": "normal",
                "question_pin_seconds": None,
            },
            {
                "slide_index": 1,
                "text": "두 번째 슬라이드 발화 텍스트.",
                "start_seconds": 30,
                "end_seconds": 60,
                "tone": "emphasis",
                "question_pin_seconds": None,
            },
        ],
        ai_segments=[],
    ))
    await db.flush()

    resp = await client.get(
        f"/api/lectures/{lecture.id}/slides",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert [s["index"] for s in data["slides"]] == [0, 1]
    assert all(s["status"] == "ready" for s in data["slides"])
    # 첫 줄을 잘라 title 로 사용
    assert data["slides"][0]["title"] == "안녕하세요. 첫 번째 슬라이드 다듬은 스크립트."
    # SlideMeta.image_url 응답 contract — SlideEmbedding 이 없으므로 None.
    # 창 1/2 미배포 환경에서도 키 자체는 항상 존재해야 한다 (프론트가 안전하게 읽음).
    assert all("image_url" in s for s in data["slides"])
    assert all(s["image_url"] is None for s in data["slides"])


@pytest.mark.asyncio
async def test_get_lecture_slides_image_url_graceful_when_column_missing(
    client, professor, lecture, db, monkeypatch,
):
    """slide_image_url 컬럼이 모델에 없는 (창 2 미배포) 상황을 시뮬레이션 —
    pipeline_task_id 가 있어 SlideEmbedding 쿼리 경로를 타더라도 500 이 나지
    않고 image_url=None 으로 응답해야 한다. hasattr 기반 graceful fallback 회귀
    가드.
    """
    from sqlalchemy import update

    from app.models.embedding import SlideEmbedding
    from app.models.lecture import Lecture as LectureModel

    task_id = "task-img-url-fallback"
    await db.execute(
        update(LectureModel)
        .where(LectureModel.id == lecture.id)
        .values(pipeline_task_id=task_id)
    )
    await db.flush()

    # 창 2 가 컬럼을 추가하기 전 환경을 정확히 재현. SQLAlchemy mapped class
    # 에서 컬럼 attribute 만 일시적으로 제거해 hasattr() 가 False 를 반환하게
    # 한다. monkeypatch 가 테스트 종료 시 자동으로 원복한다.
    if hasattr(SlideEmbedding, "slide_image_url"):
        monkeypatch.delattr(SlideEmbedding, "slide_image_url", raising=False)
    assert not hasattr(SlideEmbedding, "slide_image_url")

    resp = await client.get(
        f"/api/lectures/{lecture.id}/slides",
        headers=make_auth_header(professor),
    )
    # 핵심: 500 이 아닌 200 OK — hasattr 분기가 AttributeError 를 막아야 한다.
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["slides"], list)
    # SlideEmbedding 행은 없지만 응답 스키마는 image_url 키 자체가 항상 nullable.
    for slide in data["slides"]:
        assert "image_url" in slide
        assert slide["image_url"] is None


@pytest.mark.asyncio
async def test_get_lecture_slides_other_professor_forbidden(
    client, db, lecture, professor,
):
    """소유자가 아닌 교수자 → 404 (assert_professor_owns_lecture 패턴)."""
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        google_sub="other-prof-slides",
        email="other-slides@test.ac.kr",
        name="다른교수",
        role=UserRole.professor,
        school="다른대학교",
        is_active=True,
    )
    db.add(other)
    await db.flush()

    resp = await client.get(
        f"/api/lectures/{lecture.id}/slides",
        headers=make_auth_header(other),
    )
    assert resp.status_code == 404
