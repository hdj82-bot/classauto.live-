"""retriever 서비스 단위 테스트."""
from unittest.mock import MagicMock, patch


from app.services.pipeline.retriever import (
    RetrievalResult,
    SIMILARITY_THRESHOLD,
    is_in_scope,
    search_similar_slides,
)


class TestIsInScope:
    """is_in_scope() 테스트."""

    def test_empty_results_returns_false(self):
        assert is_in_scope([]) is False

    def test_above_threshold_returns_true(self):
        results = [RetrievalResult(slide_number=1, text_content="test", similarity=0.9)]
        assert is_in_scope(results) is True

    def test_below_threshold_returns_false(self):
        results = [RetrievalResult(slide_number=1, text_content="test", similarity=0.3)]
        assert is_in_scope(results) is False

    def test_exact_threshold_returns_true(self):
        results = [
            RetrievalResult(
                slide_number=1,
                text_content="test",
                similarity=SIMILARITY_THRESHOLD,
            )
        ]
        assert is_in_scope(results) is True

    def test_custom_threshold(self):
        results = [RetrievalResult(slide_number=1, text_content="test", similarity=0.5)]
        assert is_in_scope(results, threshold=0.4) is True
        assert is_in_scope(results, threshold=0.6) is False

    def test_only_checks_first_result(self):
        """첫 번째 결과만 검사 (가장 유사도 높은 것)."""
        results = [
            RetrievalResult(slide_number=1, text_content="low", similarity=0.3),
            RetrievalResult(slide_number=2, text_content="high", similarity=0.95),
        ]
        # 첫 번째가 0.3이므로 False
        assert is_in_scope(results) is False


class TestSearchSimilarSlides:
    """search_similar_slides() 테스트."""

    @patch("app.services.pipeline.retriever.get_embeddings")
    def test_embedding_failure_returns_empty(self, mock_get_emb):
        """임베딩 생성 실패 시 빈 리스트 반환."""
        mock_get_emb.side_effect = RuntimeError("API error")
        db = MagicMock()

        result = search_similar_slides(db, "task-123", "질문 텍스트")

        assert result == []

    @patch("app.services.pipeline.retriever.get_embeddings")
    def test_db_query_failure_returns_empty(self, mock_get_emb):
        """DB 쿼리 실패 시 빈 리스트 반환."""
        mock_get_emb.return_value = [[0.1] * 1536]
        db = MagicMock()
        db.execute.side_effect = Exception("DB connection lost")

        result = search_similar_slides(db, "task-123", "질문")

        assert result == []

    @patch("app.services.pipeline.retriever.get_embeddings")
    def test_success_returns_results(self, mock_get_emb):
        """정상 검색 결과 반환."""
        mock_get_emb.return_value = [[0.1] * 1536]

        mock_row1 = MagicMock()
        mock_row1.slide_number = 3
        mock_row1.text_content = "데이터 구조 개념"
        mock_row1.similarity = 0.92

        mock_row2 = MagicMock()
        mock_row2.slide_number = 5
        mock_row2.text_content = "알고리즘 기초"
        mock_row2.similarity = 0.78

        db = MagicMock()
        db.execute.return_value.fetchall.return_value = [mock_row1, mock_row2]

        result = search_similar_slides(db, "task-abc", "데이터 구조란?", top_k=3)

        assert len(result) == 2
        assert result[0].slide_number == 3
        assert result[0].similarity == 0.92
        assert result[1].text_content == "알고리즘 기초"

    @patch("app.services.pipeline.retriever.get_embeddings")
    def test_empty_db_result(self, mock_get_emb):
        """DB 결과가 없을 때 빈 리스트."""
        mock_get_emb.return_value = [[0.1] * 1536]
        db = MagicMock()
        db.execute.return_value.fetchall.return_value = []

        result = search_similar_slides(db, "task-abc", "관련 없는 질문")

        assert result == []

    @patch("app.services.pipeline.retriever.get_embeddings")
    def test_vector_string_format(self, mock_get_emb):
        """벡터가 올바른 PostgreSQL 문자열 형식으로 전달되는지 확인."""
        mock_get_emb.return_value = [[0.1, 0.2, 0.3]]
        db = MagicMock()
        db.execute.return_value.fetchall.return_value = []

        search_similar_slides(db, "task-x", "test")

        call_args = db.execute.call_args[0]
        params = call_args[1]
        assert params["query_vec"] == "[0.1,0.2,0.3]"
        assert params["task_id"] == "task-x"
        assert params["top_k"] == 3
