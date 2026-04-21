"""embedding 서비스 단위 테스트."""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services.pipeline.schemas import SlideContent


class TestGetEmbeddings:
    """get_embeddings() 테스트."""

    @patch("app.services.pipeline.embedding.openai.OpenAI")
    def test_empty_texts_returns_empty(self, mock_openai_cls):
        from app.services.pipeline.embedding import get_embeddings

        result = get_embeddings([])
        assert result == []
        mock_openai_cls.assert_not_called()

    @patch("app.services.pipeline.embedding.openai.OpenAI")
    def test_single_text(self, mock_openai_cls):
        from app.services.pipeline.embedding import get_embeddings

        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client

        fake_embedding = [0.1] * 1536
        mock_item = MagicMock()
        mock_item.embedding = fake_embedding
        mock_response = MagicMock()
        mock_response.data = [mock_item]
        mock_client.embeddings.create.return_value = mock_response

        result = get_embeddings(["hello world"])

        assert len(result) == 1
        assert result[0] == fake_embedding
        mock_client.embeddings.create.assert_called_once()

    @patch("app.services.pipeline.embedding.openai.OpenAI")
    def test_batch_splitting(self, mock_openai_cls):
        """MAX_BATCH_SIZE(100)를 초과하면 배치 분할 확인."""
        from app.services.pipeline.embedding import MAX_BATCH_SIZE, get_embeddings

        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client

        fake_embedding = [0.1] * 1536
        mock_item = MagicMock()
        mock_item.embedding = fake_embedding

        # 150개 텍스트 → 2번 호출
        texts = [f"text {i}" for i in range(150)]

        def create_side_effect(**kwargs):
            batch = kwargs.get("input", [])
            resp = MagicMock()
            items = [MagicMock(embedding=fake_embedding) for _ in batch]
            resp.data = items
            return resp

        mock_client.embeddings.create.side_effect = create_side_effect

        result = get_embeddings(texts)

        assert len(result) == 150
        assert mock_client.embeddings.create.call_count == 2

    @patch("app.services.pipeline.embedding.openai.OpenAI")
    def test_api_error_raises_runtime_error(self, mock_openai_cls):
        """OpenAI API 에러 시 RuntimeError 발생."""
        import openai

        from app.services.pipeline.embedding import get_embeddings

        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.embeddings.create.side_effect = openai.APIError(
            message="Rate limit exceeded",
            request=MagicMock(),
            body=None,
        )

        with pytest.raises(RuntimeError, match="임베딩 생성 실패"):
            get_embeddings(["test text"])


class TestStoreSlideEmbeddings:
    """store_slide_embeddings() 테스트."""

    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_empty_slides_returns_zero(self, mock_get_emb):
        from app.services.pipeline.embedding import store_slide_embeddings

        db = MagicMock()
        result = store_slide_embeddings(db, "task-123", [])

        assert result == 0
        mock_get_emb.assert_not_called()

    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_slides_with_no_text_returns_zero(self, mock_get_emb):
        from app.services.pipeline.embedding import store_slide_embeddings

        db = MagicMock()
        slides = [
            SlideContent(slide_number=1, texts=[], speaker_notes=""),
            SlideContent(slide_number=2, texts=["   "], speaker_notes=""),
        ]

        result = store_slide_embeddings(db, "task-123", slides)

        assert result == 0
        mock_get_emb.assert_not_called()

    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_stores_embeddings_correctly(self, mock_get_emb):
        from app.services.pipeline.embedding import store_slide_embeddings

        db = MagicMock()
        fake_emb = [0.1] * 1536
        mock_get_emb.return_value = [fake_emb, fake_emb]

        slides = [
            SlideContent(slide_number=1, texts=["첫 번째 슬라이드"], speaker_notes="노트1"),
            SlideContent(slide_number=2, texts=["두 번째"], speaker_notes=""),
        ]

        result = store_slide_embeddings(db, "task-abc", slides)

        assert result == 2
        db.add_all.assert_called_once()
        db.flush.assert_called_once()
        records = db.add_all.call_args[0][0]
        assert len(records) == 2
        assert records[0].task_id == "task-abc"
        assert records[0].slide_number == 1

    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_speaker_notes_prepended_to_text(self, mock_get_emb):
        """speaker_notes가 본문 앞에 추가되는지 확인."""
        from app.services.pipeline.embedding import store_slide_embeddings

        db = MagicMock()
        mock_get_emb.return_value = [[0.1] * 1536]

        slides = [
            SlideContent(slide_number=1, texts=["본문"], speaker_notes="발표자 노트"),
        ]

        store_slide_embeddings(db, "task-x", slides)

        # get_embeddings에 전달된 텍스트에 노트가 포함되어야 함
        called_texts = mock_get_emb.call_args[0][0]
        assert "발표자 노트" in called_texts[0]
        assert "본문" in called_texts[0]
