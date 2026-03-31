"""HeyGen 서비스 및 API 엔드포인트 테스트."""
import uuid
from unittest.mock import patch, AsyncMock, MagicMock

import httpx
import pytest

from app.services.pipeline.heygen import (
    HeyGenError,
    create_video,
    get_video_status,
    list_avatars,
    delete_video,
    get_remaining_quota,
    _request_with_retry,
)
from tests.conftest import make_auth_header


# ── _request_with_retry ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_request_with_retry_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("app.services.pipeline.heygen.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await _request_with_retry("GET", "https://api.heygen.com/test")

    assert result.status_code == 200
    mock_client.request.assert_called_once()


@pytest.mark.asyncio
async def test_request_with_retry_retries_on_500():
    mock_resp_500 = MagicMock()
    mock_resp_500.status_code = 500
    mock_resp_500.text = "Internal Server Error"

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200

    with patch("app.services.pipeline.heygen.httpx.AsyncClient") as mock_client_cls, \
         patch("app.services.pipeline.heygen.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.request.side_effect = [mock_resp_500, mock_resp_200]
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await _request_with_retry("GET", "https://api.heygen.com/test")

    assert result.status_code == 200
    assert mock_client.request.call_count == 2


@pytest.mark.asyncio
async def test_request_with_retry_max_retries_exceeded():
    mock_resp = MagicMock()
    mock_resp.status_code = 503
    mock_resp.text = "Service Unavailable"

    with patch("app.services.pipeline.heygen.httpx.AsyncClient") as mock_client_cls, \
         patch("app.services.pipeline.heygen.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(HeyGenError, match="최대 재시도 초과"):
            await _request_with_retry("GET", "https://api.heygen.com/test")


@pytest.mark.asyncio
async def test_request_with_retry_timeout():
    with patch("app.services.pipeline.heygen.httpx.AsyncClient") as mock_client_cls, \
         patch("app.services.pipeline.heygen.asyncio.sleep", new_callable=AsyncMock):
        mock_client = AsyncMock()
        mock_client.request.side_effect = httpx.TimeoutException("timeout")
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(HeyGenError, match="최대 재시도 초과"):
            await _request_with_retry("GET", "https://api.heygen.com/test")


# ── create_video ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_video_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": {"video_id": "vid-123"}}

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        video_id = await create_video(audio_url="https://s3.amazonaws.com/audio.mp3")

    assert video_id == "vid-123"


@pytest.mark.asyncio
async def test_create_video_api_error():
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "Bad Request"

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(HeyGenError, match="400"):
            await create_video(audio_url="https://s3.amazonaws.com/audio.mp3")


@pytest.mark.asyncio
async def test_create_video_no_video_id():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": {}}
    mock_resp.text = "no video_id"

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(HeyGenError, match="video_id 없음"):
            await create_video(audio_url="https://s3.amazonaws.com/audio.mp3")


# ── get_video_status ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_video_status_completed():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {
            "status": "completed",
            "video_url": "https://heygen.com/video.mp4",
            "duration": 30.5,
        }
    }

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        status = await get_video_status("vid-123")

    assert status["status"] == "completed"
    assert status["video_url"] == "https://heygen.com/video.mp4"
    assert status["duration"] == 30.5


@pytest.mark.asyncio
async def test_get_video_status_failed():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {"status": "failed", "error": "Rendering timeout"}
    }

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        status = await get_video_status("vid-123")

    assert status["status"] == "failed"
    assert status["error"] == "Rendering timeout"


# ── list_avatars ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_avatars_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {
            "avatars": [
                {
                    "avatar_id": "avatar-1",
                    "avatar_name": "Anna",
                    "gender": "female",
                    "preview_image_url": "https://heygen.com/anna.jpg",
                    "preview_video_url": "https://heygen.com/anna.mp4",
                },
                {
                    "avatar_id": "avatar-2",
                    "avatar_name": "Josh",
                    "gender": "male",
                    "preview_image_url": "https://heygen.com/josh.jpg",
                    "preview_video_url": None,
                },
            ]
        }
    }

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        avatars = await list_avatars()

    assert len(avatars) == 2
    assert avatars[0]["avatar_id"] == "avatar-1"
    assert avatars[1]["avatar_name"] == "Josh"


@pytest.mark.asyncio
async def test_list_avatars_api_error():
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized"

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        with pytest.raises(HeyGenError, match="401"):
            await list_avatars()


# ── delete_video ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_video_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        result = await delete_video("vid-123")

    assert result is True


@pytest.mark.asyncio
async def test_delete_video_failure():
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = "Not Found"

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        result = await delete_video("vid-nonexistent")

    assert result is False


# ── get_remaining_quota ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_remaining_quota():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {"remaining_quota": 42, "plan": "enterprise"}
    }

    with patch("app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock, return_value=mock_resp):
        quota = await get_remaining_quota()

    assert quota["remaining_quota"] == 42


# ── API 엔드포인트 ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_avatars_endpoint(client, professor):
    with patch("app.services.pipeline.heygen.list_avatars", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [
            {"avatar_id": "a1", "avatar_name": "Anna", "gender": "female",
             "preview_image_url": None, "preview_video_url": None}
        ]
        resp = await client.get(
            "/api/v1/render/avatars",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["avatars"][0]["avatar_id"] == "a1"


@pytest.mark.asyncio
async def test_avatars_endpoint_student_forbidden(client, student):
    resp = await client.get(
        "/api/v1/render/avatars",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_avatars_endpoint_heygen_error(client, professor):
    with patch("app.services.pipeline.heygen.list_avatars", new_callable=AsyncMock) as mock_list:
        mock_list.side_effect = HeyGenError("API key invalid")
        resp = await client.get(
            "/api/v1/render/avatars",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_quota_endpoint(client, professor):
    with patch("app.services.pipeline.heygen.get_remaining_quota", new_callable=AsyncMock) as mock_quota:
        mock_quota.return_value = {"remaining_quota": 100, "details": {}}
        resp = await client.get(
            "/api/v1/render/quota",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["remaining_quota"] == 100


@pytest.mark.asyncio
async def test_quota_endpoint_student_forbidden(client, student):
    resp = await client.get(
        "/api/v1/render/quota",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403
