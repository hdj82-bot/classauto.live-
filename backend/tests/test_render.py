"""렌더링 파이프라인 API 통합 테스트."""
import uuid
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.models.video_render import VideoRender, RenderStatus
from tests.conftest import make_auth_header


# ── 렌더링 요청 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_render_request(client, professor, lecture):
    with patch("app.api.v1.render.check_limit", new_callable=AsyncMock) as mock_limit, \
         patch("app.api.v1.render.render_slide") as mock_task:
        mock_task.delay = MagicMock()
        resp = await client.post(
            "/api/v1/render",
            json={
                "lecture_id": str(lecture.id),
                "scripts": [
                    {"script": "안녕하세요", "slide_number": 1},
                    {"script": "감사합니다", "slide_number": 2},
                ],
            },
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["render_ids"]) == 2
    assert "message" in data


@pytest.mark.asyncio
async def test_create_render_plan_limit_exceeded(client, professor, lecture):
    with patch("app.api.v1.render.check_limit", new_callable=AsyncMock) as mock_limit:
        from app.services.pipeline.subscription import PlanLimitExceeded
        mock_limit.side_effect = PlanLimitExceeded("월간 한도를 초과했습니다.")
        resp = await client.post(
            "/api/v1/render",
            json={
                "lecture_id": str(lecture.id),
                "scripts": [{"script": "테스트", "slide_number": 1}],
            },
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_create_render_student_forbidden(client, student, lecture):
    resp = await client.post(
        "/api/v1/render",
        json={
            "lecture_id": str(lecture.id),
            "scripts": [{"script": "테스트", "slide_number": 1}],
        },
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── 렌더 상태 조회 ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_lecture_render_status_empty(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/render/lecture/{lecture.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["completed"] == 0
    assert data["failed"] == 0


@pytest.mark.asyncio
async def test_get_lecture_render_status_with_renders(client, professor, lecture, db):
    for i, status in enumerate([RenderStatus.ready, RenderStatus.failed, RenderStatus.pending]):
        db.add(VideoRender(
            id=uuid.uuid4(),
            lecture_id=lecture.id,
            instructor_id=professor.id,
            avatar_id="test-avatar",
            tts_provider="elevenlabs",
            slide_number=i + 1,
            status=status,
        ))
    await db.flush()

    resp = await client.get(
        f"/api/v1/render/lecture/{lecture.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["completed"] == 1
    assert data["failed"] == 1


# ── PPT 업로드 ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_ppt_no_file(client, professor, lecture):
    resp = await client.post(
        "/api/v1/render/upload",
        data={"lecture_id": str(lecture.id)},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 422
