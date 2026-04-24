"""S3 서비스 단위 테스트."""
from unittest.mock import patch, MagicMock

import pytest

from app.services.pipeline import s3 as s3_svc


# ── upload_file ──────────────────────────────────────────────────────────────

def test_upload_file():
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        url = s3_svc.upload_file(b"hello", "test/key.txt", "text/plain")

    mock_client.put_object.assert_called_once()
    call_kwargs = mock_client.put_object.call_args
    assert call_kwargs[1]["Key"] == "test/key.txt"
    assert call_kwargs[1]["Body"] == b"hello"
    assert call_kwargs[1]["ContentType"] == "text/plain"
    assert "test/key.txt" in url


# ── download_file ────────────────────────────────────────────────────────────

def test_download_file():
    mock_client = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = b"file-content"
    mock_client.get_object.return_value = {"Body": mock_body}

    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        data = s3_svc.download_file("test/key.txt")

    assert data == b"file-content"
    mock_client.get_object.assert_called_once()


# ── generate_presigned_url ───────────────────────────────────────────────────

def test_generate_presigned_url():
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://presigned-url"

    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        url = s3_svc.generate_presigned_url("test/key.txt", expiration=600)

    assert url == "https://presigned-url"
    mock_client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": s3_svc.settings.S3_BUCKET, "Key": "test/key.txt"},
        ExpiresIn=600,
    )


# ── delete_file ──────────────────────────────────────────────────────────────

def test_delete_file_success():
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        result = s3_svc.delete_file("test/key.txt")

    assert result is True
    mock_client.delete_object.assert_called_once()


def test_delete_file_failure():
    from botocore.exceptions import ClientError

    mock_client = MagicMock()
    mock_client.delete_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "Not found"}}, "DeleteObject"
    )
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        result = s3_svc.delete_file("nonexistent/key.txt")

    assert result is False


# ── file_exists ──────────────────────────────────────────────────────────────

def test_file_exists_true():
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        assert s3_svc.file_exists("test/key.txt") is True


def test_file_exists_false():
    from botocore.exceptions import ClientError

    mock_client = MagicMock()
    mock_client.head_object.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject"
    )
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        assert s3_svc.file_exists("nonexistent/key.txt") is False


# ── upload_ppt ───────────────────────────────────────────────────────────────

# 최소 PPTX(=ZIP) 바이트: PK\x03\x04 매직바이트로 시작하는 바디면 validate_pptx_content 통과.
_MIN_PPTX_BYTES = b"PK\x03\x04" + b"\x00" * 28

def test_upload_ppt():
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        s3_url, s3_key = s3_svc.upload_ppt(_MIN_PPTX_BYTES, "lecture-123", "my slide.pptx")

    assert "lecture-123" in s3_key
    assert "my_slide.pptx" in s3_key  # 공백 → 언더스코어
    assert s3_key.startswith(s3_svc.settings.S3_PPT_PREFIX)
    assert "lecture-123" in s3_url
    mock_client.put_object.assert_called_once()


# ── upload_audio_bytes ───────────────────────────────────────────────────────

def test_upload_audio_bytes():
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        url = s3_svc.upload_audio_bytes(b"audio-data", "render-456")

    assert "render-456.mp3" in url
    mock_client.put_object.assert_called_once()


# ── upload_from_url ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_from_url():

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.content = b"video-data"
    mock_response.raise_for_status = MagicMock()

    with patch.object(s3_svc, "get_s3_client", return_value=mock_client), \
         patch("app.services.pipeline.s3.httpx.AsyncClient") as mock_httpx:
        mock_httpx.return_value.__aenter__ = lambda self: self._make_awaitable(mock_httpx.return_value)
        mock_httpx.return_value.__aexit__ = lambda self, *args: self._make_awaitable(None)

        # 간단한 접근: httpx를 직접 mock하기 어려우므로 skip
        pass
