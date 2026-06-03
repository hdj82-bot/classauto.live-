"""강의 mp4 on-demand 다운로드 — 엔드포인트 + 태스크 가드 테스트."""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_request_download_enqueues_building(client, professor, lecture):
    """최초 요청 → building 으로 전환 + 합성 태스크 enqueue."""
    with patch("app.tasks.export.compose_lecture_mp4") as mock_task:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/download",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "building"
    mock_task.delay.assert_called_once()


@pytest.mark.asyncio
async def test_request_download_returns_cached_ready(client, professor, lecture, db):
    """이미 ready 면 재인코딩 없이 URL 반환(태스크 미호출)."""
    lecture.mp4_status = "ready"
    lecture.mp4_url = "https://external.example/lec.mp4"
    await db.commit()
    with patch("app.tasks.export.compose_lecture_mp4") as mock_task:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/download",
            headers=make_auth_header(professor),
        )
    data = resp.json()
    assert data["status"] == "ready"
    # 외부 URL(우리 버킷 아님) → presign 통과.
    assert data["url"] == "https://external.example/lec.mp4"
    mock_task.delay.assert_not_called()


@pytest.mark.asyncio
async def test_request_download_force_rebuilds(client, professor, lecture, db):
    """force=true 면 ready 여도 다시 합성 enqueue."""
    lecture.mp4_status = "ready"
    lecture.mp4_url = "https://external.example/lec.mp4"
    await db.commit()
    with patch("app.tasks.export.compose_lecture_mp4") as mock_task:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/download?force=true",
            headers=make_auth_header(professor),
        )
    assert resp.json()["status"] == "building"
    mock_task.delay.assert_called_once()


@pytest.mark.asyncio
async def test_get_download_status_none(client, professor, lecture):
    resp = await client.get(
        f"/api/lectures/{lecture.id}/download",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "none", "url": None}


@pytest.mark.asyncio
async def test_download_forbidden_for_student(client, student, lecture):
    resp = await client.post(
        f"/api/lectures/{lecture.id}/download",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


def test_compose_task_ffmpeg_missing_marks_failed():
    """ffmpeg 미설치면 failed 로 마킹하고 안전 종료."""
    from app.tasks import export

    lecture = MagicMock()
    lecture.mp4_status = None
    lecture.mp4_url = None
    db = MagicMock()
    db.query.return_value.filter.return_value.one_or_none.return_value = lecture

    with patch.object(export, "SyncSessionLocal", return_value=db), patch(
        "shutil.which", return_value=None
    ):
        outcome = export.compose_lecture_mp4.apply(args=[str(uuid.uuid4()), None])
        result = outcome.get(propagate=True)

    assert result["status"] == "failed"
    assert result["reason"] == "ffmpeg_missing"
    assert lecture.mp4_status == "failed"
