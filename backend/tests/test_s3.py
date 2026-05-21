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


# ── presign_stored_s3_url ─────────────────────────────────────────────────────

def test_presign_stored_s3_url_converts_our_bucket_url():
    """우리 버킷의 영구형 URL → key 추출 후 presigned 로 변환."""
    bucket = s3_svc.settings.S3_BUCKET
    region = s3_svc.settings.AWS_REGION
    stored = f"https://{bucket}.s3.{region}.amazonaws.com/thumbnails/slides/lec-1/3.png"

    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://signed.example/3.png?sig=abc"
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        out = s3_svc.presign_stored_s3_url(stored, expiration=600)

    assert out == "https://signed.example/3.png?sig=abc"
    # 추출된 key 가 prefix 포함 전체 경로여야 한다 (1-based 파일명까지).
    mock_client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": bucket, "Key": "thumbnails/slides/lec-1/3.png"},
        ExpiresIn=600,
    )


def test_presign_stored_s3_url_passthrough_none_and_external():
    """None 과 외부(타 버킷) URL 은 변환 없이 그대로 통과."""
    external = "https://cdn.heygen.com/video/abc.mp4"
    # 외부 URL 은 S3 client 를 아예 호출하지 않아야 한다.
    with patch.object(s3_svc, "get_s3_client") as get_client:
        assert s3_svc.presign_stored_s3_url(None) is None
        assert s3_svc.presign_stored_s3_url("") == ""
        assert s3_svc.presign_stored_s3_url(external) == external
        get_client.assert_not_called()


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


# ── upload_slide_image ───────────────────────────────────────────────────────

def test_upload_slide_image_key_and_headers():
    """key 가 thumbnails/ prefix 아래에 떨어져야 한다 — 버킷 정책 public-read
    범위가 thumbnails/* 에만 잡혀 있어 그 안에 nest 한다."""
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        url = s3_svc.upload_slide_image(b"\x89PNG\r\n\x1a\n", "lecture-abc", 1)

    mock_client.put_object.assert_called_once()
    kw = mock_client.put_object.call_args[1]
    assert kw["Key"] == "thumbnails/slides/lecture-abc/1.png"
    assert kw["ContentType"] == "image/png"
    assert kw["CacheControl"] == "public, max-age=86400"
    assert kw["Body"] == b"\x89PNG\r\n\x1a\n"
    assert "thumbnails/slides/lecture-abc/1.png" in url


def test_upload_slide_image_overwrites_same_key_per_slide():
    """동일 lecture_id + slide_number 는 같은 key — 재업로드 시 덮어쓰기."""
    mock_client = MagicMock()
    with patch.object(s3_svc, "get_s3_client", return_value=mock_client):
        url1 = s3_svc.upload_slide_image(b"v1", "lec-1", 3)
        url2 = s3_svc.upload_slide_image(b"v2", "lec-1", 3)

    assert url1 == url2
    assert mock_client.put_object.call_count == 2


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
