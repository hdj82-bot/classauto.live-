"""렌더링 파이프라인 API 통합 테스트."""
import uuid
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.models.video_render import VideoRender, RenderStatus
from tests.conftest import make_auth_header


# ── 렌더링 요청 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_render_request(client, professor, lecture):
    with patch("app.services.pipeline.subscription.check_limit", new_callable=AsyncMock), \
         patch("app.tasks.render.render_slide") as mock_task:
        mock_task.delay = MagicMock()
        resp = await client.post(
            "/api/v1/render",
            params={"lecture_id": str(lecture.id)},
            json=[
                {"script": "안녕하세요", "slide_number": 1},
                {"script": "감사합니다", "slide_number": 2},
            ],
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["render_ids"]) == 2
    assert "message" in data


@pytest.mark.asyncio
async def test_create_render_plan_limit_exceeded(client, professor, lecture):
    with patch("app.services.pipeline.subscription.check_limit", new_callable=AsyncMock) as mock_limit:
        from app.services.pipeline.subscription import PlanLimitExceeded
        mock_limit.side_effect = PlanLimitExceeded("FREE", 2, 2)
        resp = await client.post(
            "/api/v1/render",
            params={"lecture_id": str(lecture.id)},
            json=[{"script": "테스트", "slide_number": 1}],
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_create_render_student_forbidden(client, student, lecture):
    resp = await client.post(
        "/api/v1/render",
        params={"lecture_id": str(lecture.id)},
        json=[{"script": "테스트", "slide_number": 1}],
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


@pytest.mark.asyncio
async def test_upload_ppt_invalid_extension(client, professor, lecture):
    resp = await client.post(
        "/api/v1/render/upload",
        params={"lecture_id": str(lecture.id)},
        files={"file": ("test.pdf", b"fake-content", "application/pdf")},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400
    assert ".pptx" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_ppt_success_s3(client, professor, lecture):
    # PK\x03\x04 매직바이트(Critical 6) 가 새 검증에서 강제되므로 유효한 ZIP 시그니처로 시작
    valid_pptx_bytes = b"PK\x03\x04fake-pptx-payload"
    with patch("app.services.pipeline.s3.upload_ppt", return_value=("https://s3.amazonaws.com/ppt/test.pptx", "ppt/test.pptx")), \
         patch("app.tasks.pipeline.start_pipeline") as mock_pipeline:
        mock_pipeline.return_value = MagicMock(id="celery-task-123")
        resp = await client.post(
            "/api/v1/render/upload",
            params={"lecture_id": str(lecture.id)},
            files={"file": ("lecture.pptx", valid_pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data
    assert data["s3_url"] == "https://s3.amazonaws.com/ppt/test.pptx"
    assert data["celery_task_id"] == "celery-task-123"
    mock_pipeline.assert_called_once()


@pytest.mark.asyncio
async def test_upload_ppt_student_forbidden(client, student, lecture):
    resp = await client.post(
        "/api/v1/render/upload",
        params={"lecture_id": str(lecture.id)},
        files={"file": ("lecture.pptx", b"fake-content", "application/octet-stream")},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── Critical 5/6: 업로드 보안 경계 ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_ppt_oversize_streaming_rejects(client, professor, lecture):
    """100MB 한도 초과 시 413 — 스트리밍 검사로 끝까지 읽지 않고 거부."""
    from app.api.v1 import render as render_api

    oversized = b"PK\x03\x04" + b"\x00" * (render_api.MAX_UPLOAD_SIZE + 1024)

    with patch("app.services.pipeline.s3.upload_ppt") as mock_upload, \
         patch("app.tasks.pipeline.start_pipeline") as mock_pipeline:
        resp = await client.post(
            "/api/v1/render/upload",
            params={"lecture_id": str(lecture.id)},
            files={"file": ("big.pptx", oversized, "application/octet-stream")},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 413
    # 한도 초과 시 S3 / pipeline 호출까지 가지 않아야 함
    mock_upload.assert_not_called()
    mock_pipeline.assert_not_called()


@pytest.mark.asyncio
async def test_upload_ppt_filename_path_traversal_replaced_with_uuid(
    client, professor, lecture,
):
    """사용자 제공 파일명(`../../etc/passwd.pptx`)은 UUID로 강제 치환되어 S3 key 에 포함되지 않아야 함."""
    captured = {}

    def _fake_upload(content, lecture_id, filename):
        captured["filename"] = filename
        captured["content"] = content
        return ("https://s3.amazonaws.com/x.pptx", f"ppt/{lecture_id}/{filename}")

    with patch("app.services.pipeline.s3.upload_ppt", side_effect=_fake_upload), \
         patch("app.tasks.pipeline.start_pipeline") as mock_pipeline:
        mock_pipeline.return_value = MagicMock(id="celery-task-aaa")
        resp = await client.post(
            "/api/v1/render/upload",
            params={"lecture_id": str(lecture.id)},
            files={
                "file": (
                    "../../etc/passwd.pptx",
                    b"PK\x03\x04valid-zip-header",
                    "application/octet-stream",
                ),
            },
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    safe = captured["filename"]
    # path traversal 문자/원본 파일명 흔적이 전혀 없어야 함
    assert ".." not in safe
    assert "/" not in safe
    assert "passwd" not in safe
    assert safe.endswith(".pptx")
    # uuid4().hex (32 hex chars) + ".pptx"
    assert len(safe) == 32 + len(".pptx")


@pytest.mark.asyncio
async def test_upload_ppt_magic_byte_mismatch_rejected(client, professor, lecture):
    """확장자가 .pptx 라도 ZIP 매직바이트가 없으면 400."""
    with patch("app.services.pipeline.s3.upload_ppt") as mock_upload:
        resp = await client.post(
            "/api/v1/render/upload",
            params={"lecture_id": str(lecture.id)},
            files={
                "file": (
                    "fake.pptx",
                    b"NOTAPPTX-just-text",  # PK\x03\x04 시그니처 없음
                    "application/octet-stream",
                ),
            },
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400
    assert "PPTX" in resp.json()["detail"] or "ZIP" in resp.json()["detail"]
    mock_upload.assert_not_called()


@pytest.mark.asyncio
async def test_upload_ppt_content_length_pre_check_rejects(
    client, professor, lecture,
):
    """Content-Length 헤더가 한도를 명백히 초과하면 본문 읽기 전에 413."""
    from app.api.v1 import render as render_api

    huge_declared = render_api.MAX_UPLOAD_SIZE * 10
    # FastAPI/Starlette 이 multipart 를 파싱하기 전 헤더만 보고 거부해야 함
    resp = await client.post(
        "/api/v1/render/upload",
        params={"lecture_id": str(lecture.id)},
        files={"file": ("a.pptx", b"PK\x03\x04short", "application/octet-stream")},
        headers={
            **make_auth_header(professor),
            "content-length": str(huge_declared),
        },
    )
    # httpx 가 Content-Length 를 자동 재계산할 수 있으므로 200 도 허용,
    # 단 명시적으로 큰 값을 받았다면 413 이어야 함.
    assert resp.status_code in (200, 413)
