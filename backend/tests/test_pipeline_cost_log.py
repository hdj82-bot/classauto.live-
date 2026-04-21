"""cost_log 서비스 단위 테스트."""
import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services.pipeline.cost_log import record


class TestRecord:
    """record() 함수 테스트."""

    def _make_db(self):
        db = MagicMock()
        db.add = MagicMock()
        db.flush = MagicMock()
        return db

    def test_record_basic(self):
        db = self._make_db()
        render_id = uuid.uuid4()

        result = record(
            db=db,
            video_render_id=render_id,
            service="heygen",
            operation="create_video",
            cost_usd=0.50,
        )

        db.add.assert_called_once()
        db.flush.assert_called_once()
        assert result.video_render_id == render_id
        assert result.service == "heygen"
        assert result.operation == "create_video"
        assert result.cost_usd == 0.50
        assert result.duration_seconds is None
        assert result.metadata_json is None

    def test_record_with_metadata(self):
        db = self._make_db()
        render_id = uuid.uuid4()
        meta = {"model": "gpt-4", "tokens": 1500}

        result = record(
            db=db,
            video_render_id=render_id,
            service="openai",
            operation="embedding",
            cost_usd=0.01,
            duration_seconds=2.5,
            metadata=meta,
        )

        assert result.duration_seconds == 2.5
        parsed_meta = json.loads(result.metadata_json)
        assert parsed_meta["model"] == "gpt-4"
        assert parsed_meta["tokens"] == 1500

    def test_record_with_empty_metadata(self):
        db = self._make_db()
        render_id = uuid.uuid4()

        result = record(
            db=db,
            video_render_id=render_id,
            service="tts",
            operation="synthesize",
            metadata=None,
        )

        assert result.metadata_json is None

    def test_record_zero_cost(self):
        db = self._make_db()
        render_id = uuid.uuid4()

        result = record(
            db=db,
            video_render_id=render_id,
            service="s3",
            operation="upload",
        )

        assert result.cost_usd == 0.0

    def test_record_metadata_korean_text(self):
        """한국어 메타데이터가 ensure_ascii=False로 올바르게 저장되는지 확인."""
        db = self._make_db()
        render_id = uuid.uuid4()
        meta = {"설명": "렌더링 완료"}

        result = record(
            db=db,
            video_render_id=render_id,
            service="heygen",
            operation="complete",
            metadata=meta,
        )

        assert "렌더링 완료" in result.metadata_json
