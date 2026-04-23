"""notification 서비스 단위 테스트."""
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import pytest


@pytest.mark.asyncio
class TestNotifyInstructor:
    """notify_instructor() 테스트."""

    @patch("app.services.pipeline.notification.settings")
    async def test_no_webhook_url_logs_only(self, mock_settings):
        """NOTIFICATION_WEBHOOK_URL 미설정 시 로그만 남기고 반환."""
        mock_settings.NOTIFICATION_WEBHOOK_URL = ""

        from app.services.pipeline.notification import notify_instructor

        # 예외 없이 정상 종료되어야 함
        await notify_instructor(
            instructor_id=uuid.uuid4(),
            lecture_id=uuid.uuid4(),
            status="done",
            video_url="https://example.com/video.mp4",
        )

    @patch("app.services.pipeline.notification.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.services.pipeline.notification.httpx.AsyncClient")
    @patch("app.services.pipeline.notification.settings")
    async def test_success_first_attempt(self, mock_settings, mock_client_cls, mock_sleep):
        """첫 시도에서 성공하면 재시도 없이 완료."""
        mock_settings.NOTIFICATION_WEBHOOK_URL = "https://hook.example.com/notify"

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from app.services.pipeline.notification import notify_instructor

        await notify_instructor(
            instructor_id=uuid.uuid4(),
            lecture_id=uuid.uuid4(),
            status="done",
        )

        mock_client.post.assert_called_once()
        mock_sleep.assert_not_called()

    @patch("app.services.pipeline.notification.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.services.pipeline.notification.httpx.AsyncClient")
    @patch("app.services.pipeline.notification.settings")
    async def test_retry_on_failure_then_success(self, mock_settings, mock_client_cls, mock_sleep):
        """첫 2회 실패 후 3회째 성공."""
        mock_settings.NOTIFICATION_WEBHOOK_URL = "https://hook.example.com/notify"

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post.side_effect = [
            httpx.ConnectError("connection refused"),
            httpx.ConnectError("connection refused"),
            mock_resp,
        ]
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from app.services.pipeline.notification import notify_instructor

        await notify_instructor(
            instructor_id=uuid.uuid4(),
            lecture_id=uuid.uuid4(),
            status="done",
        )

        assert mock_client.post.call_count == 3
        assert mock_sleep.call_count == 2

    @patch("app.services.pipeline.notification.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.services.pipeline.notification.httpx.AsyncClient")
    @patch("app.services.pipeline.notification.settings")
    async def test_all_retries_fail(self, mock_settings, mock_client_cls, mock_sleep):
        """MAX_RETRIES 모두 실패 시 예외 없이 종료 (로그만)."""
        mock_settings.NOTIFICATION_WEBHOOK_URL = "https://hook.example.com/notify"

        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.ConnectError("connection refused")
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from app.services.pipeline.notification import notify_instructor

        # 예외 없이 종료되어야 함
        await notify_instructor(
            instructor_id=uuid.uuid4(),
            lecture_id=uuid.uuid4(),
            status="failed",
            error_message="HeyGen timeout",
        )

        assert mock_client.post.call_count == 3
        assert mock_sleep.call_count == 2

    @patch("app.services.pipeline.notification.asyncio.sleep", new_callable=AsyncMock)
    @patch("app.services.pipeline.notification.httpx.AsyncClient")
    @patch("app.services.pipeline.notification.settings")
    async def test_payload_format(self, mock_settings, mock_client_cls, mock_sleep):
        """전송되는 payload 형식 확인."""
        mock_settings.NOTIFICATION_WEBHOOK_URL = "https://hook.example.com/notify"

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from app.services.pipeline.notification import notify_instructor

        inst_id = uuid.uuid4()
        lec_id = uuid.uuid4()

        await notify_instructor(
            instructor_id=inst_id,
            lecture_id=lec_id,
            status="done",
            video_url="https://cdn.example.com/v.mp4",
            error_message=None,
        )

        call_kwargs = mock_client.post.call_args
        payload = call_kwargs.kwargs["json"] if "json" in call_kwargs.kwargs else call_kwargs[1]["json"]
        assert payload["type"] == "heygen_render"
        assert payload["instructor_id"] == str(inst_id)
        assert payload["lecture_id"] == str(lec_id)
        assert payload["status"] == "done"
        assert payload["video_url"] == "https://cdn.example.com/v.mp4"
        assert payload["error_message"] is None
