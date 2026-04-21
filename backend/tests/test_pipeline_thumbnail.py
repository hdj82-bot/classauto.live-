"""thumbnail 서비스 단위 테스트."""
import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from app.services.pipeline.thumbnail import (
    THUMBNAIL_HEIGHT,
    THUMBNAIL_WIDTH,
    _create_placeholder_thumbnail,
    _resize_image,
)


class TestResizeImage:
    """_resize_image() 테스트."""

    def test_resize_to_target_dimensions(self):
        img = Image.new("RGB", (1920, 1080), color="red")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        image_bytes = buf.getvalue()

        result = _resize_image(image_bytes)

        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
        assert result_img.mode == "RGB"

    def test_resize_rgba_converted_to_rgb(self):
        """RGBA 이미지를 RGB로 변환."""
        img = Image.new("RGBA", (800, 600), color=(255, 0, 0, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        result = _resize_image(image_bytes)

        result_img = Image.open(io.BytesIO(result))
        assert result_img.mode == "RGB"

    def test_resize_small_image(self):
        """원본보다 큰 크기로 확대."""
        img = Image.new("RGB", (100, 50), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        image_bytes = buf.getvalue()

        result = _resize_image(image_bytes)

        result_img = Image.open(io.BytesIO(result))
        assert result_img.size == (THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)


class TestCreatePlaceholderThumbnail:
    """_create_placeholder_thumbnail() 테스트."""

    def test_returns_valid_jpeg(self):
        result = _create_placeholder_thumbnail()

        assert isinstance(result, bytes)
        assert len(result) > 0

        img = Image.open(io.BytesIO(result))
        assert img.size == (THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
        assert img.format == "JPEG"

    def test_gradient_colors(self):
        """그라디언트가 적용되어 상단/하단 색상이 다른지 확인."""
        result = _create_placeholder_thumbnail()
        img = Image.open(io.BytesIO(result))

        top_pixel = img.getpixel((0, 0))
        bottom_pixel = img.getpixel((0, THUMBNAIL_HEIGHT - 1))

        # 상단과 하단 색상이 달라야 함 (그라디언트)
        assert top_pixel != bottom_pixel


@pytest.mark.asyncio
class TestGenerateThumbnailFromVideoUrl:
    """generate_thumbnail_from_video_url() 테스트."""

    @patch("app.services.pipeline.thumbnail.s3_svc.upload_thumbnail")
    @patch("app.services.pipeline.thumbnail._download_image")
    @patch("app.services.pipeline.thumbnail._try_heygen_thumbnail")
    async def test_success_with_heygen_thumbnail(self, mock_try, mock_download, mock_upload):
        from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

        mock_try.return_value = "https://heygen.com/thumb.jpg"

        # 유효한 JPEG 이미지 바이트
        img = Image.new("RGB", (800, 600), color="green")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        mock_download.return_value = buf.getvalue()

        mock_upload.return_value = "https://s3.example.com/thumbnails/abc.jpg"

        result = await generate_thumbnail_from_video_url(
            "https://heygen.com/video.mp4", uuid.uuid4()
        )

        assert result == "https://s3.example.com/thumbnails/abc.jpg"
        mock_upload.assert_called_once()

    @patch("app.services.pipeline.thumbnail.s3_svc.upload_thumbnail")
    @patch("app.services.pipeline.thumbnail._create_placeholder_thumbnail")
    @patch("app.services.pipeline.thumbnail._try_heygen_thumbnail")
    async def test_fallback_to_placeholder(self, mock_try, mock_placeholder, mock_upload):
        from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

        mock_try.return_value = None

        img = Image.new("RGB", (THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), color="blue")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        mock_placeholder.return_value = buf.getvalue()

        mock_upload.return_value = "https://s3.example.com/thumbnails/placeholder.jpg"

        result = await generate_thumbnail_from_video_url(
            "https://heygen.com/video.mp4", uuid.uuid4()
        )

        assert result is not None
        mock_placeholder.assert_called_once()

    @patch("app.services.pipeline.thumbnail._try_heygen_thumbnail")
    async def test_exception_returns_none(self, mock_try):
        """예외 발생 시 None 반환 (무시)."""
        from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

        mock_try.side_effect = Exception("network error")

        result = await generate_thumbnail_from_video_url(
            "https://heygen.com/video.mp4", uuid.uuid4()
        )

        assert result is None

    @patch("app.services.pipeline.thumbnail.s3_svc.upload_thumbnail")
    @patch("app.services.pipeline.thumbnail._download_image")
    @patch("app.services.pipeline.thumbnail._try_heygen_thumbnail")
    async def test_download_fails_uses_placeholder(self, mock_try, mock_download, mock_upload):
        """이미지 다운로드 실패 시 placeholder 사용."""
        from app.services.pipeline.thumbnail import generate_thumbnail_from_video_url

        mock_try.return_value = "https://heygen.com/thumb.jpg"
        mock_download.return_value = None  # 다운로드 실패

        result = await generate_thumbnail_from_video_url(
            "https://heygen.com/video.mp4", uuid.uuid4()
        )

        # image_bytes가 None이므로 None 반환
        assert result is None


@pytest.mark.asyncio
class TestTryHeygenThumbnail:
    """_try_heygen_thumbnail() 테스트."""

    @patch("app.services.pipeline.thumbnail.httpx.AsyncClient")
    async def test_mp4_url_finds_thumbnail(self, mock_client_cls):
        from app.services.pipeline.thumbnail import _try_heygen_thumbnail

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "image/jpeg"}

        mock_client = AsyncMock()
        mock_client.head.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await _try_heygen_thumbnail("https://heygen.com/video.mp4")

        assert result is not None
        assert "_thumbnail.jpg" in result or ".jpg" in result

    @patch("app.services.pipeline.thumbnail.httpx.AsyncClient")
    async def test_non_mp4_url_returns_none(self, mock_client_cls):
        from app.services.pipeline.thumbnail import _try_heygen_thumbnail

        result = await _try_heygen_thumbnail("https://example.com/video.webm")

        assert result is None

    @patch("app.services.pipeline.thumbnail.httpx.AsyncClient")
    async def test_head_request_fails_returns_none(self, mock_client_cls):
        from app.services.pipeline.thumbnail import _try_heygen_thumbnail

        mock_client = AsyncMock()
        mock_client.head.side_effect = Exception("timeout")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await _try_heygen_thumbnail("https://heygen.com/video.mp4")

        assert result is None
