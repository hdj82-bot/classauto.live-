"""RAG Q&A 테스트 — in_scope / out_of_scope 판정."""

from unittest.mock import MagicMock, patch

from app.models.qa import QALog
from app.services.qa import OUT_OF_SCOPE_MESSAGE, answer_question
from app.services.retriever import RetrievalResult, is_in_scope, SIMILARITY_THRESHOLD


class TestIsInScope:
    """유사도 임계값 판정 테스트."""

    def test_in_scope_when_above_threshold(self):
        results = [RetrievalResult(slide_number=1, slide_id=1, text_content="t", similarity=0.85)]
        assert is_in_scope(results) is True

    def test_out_of_scope_when_below_threshold(self):
        results = [RetrievalResult(slide_number=1, slide_id=1, text_content="t", similarity=0.60)]
        assert is_in_scope(results) is False

    def test_out_of_scope_when_empty(self):
        assert is_in_scope([]) is False

    def test_boundary_value_at_threshold(self):
        results = [RetrievalResult(slide_number=1, slide_id=1, text_content="t", similarity=SIMILARITY_THRESHOLD)]
        assert is_in_scope(results) is True

    def test_boundary_just_below_threshold(self):
        results = [RetrievalResult(slide_number=1, slide_id=1, text_content="t", similarity=SIMILARITY_THRESHOLD - 0.001)]
        assert is_in_scope(results) is False


class TestAnswerQuestion:
    """answer_question 통합 로직 테스트."""

    @patch("app.services.qa.search_similar_slides")
    def test_out_of_scope_returns_warning_message(self, mock_search, db):
        """유사도 낮으면 out_of_scope 메시지를 반환한다."""
        mock_search.return_value = [
            RetrievalResult(slide_number=1, slide_id=1, text_content="내용", similarity=0.30),
        ]

        result = answer_question(db, "task123", "sess1", "관련 없는 질문")

        assert result.in_scope is False
        assert result.answer == OUT_OF_SCOPE_MESSAGE
        assert result.input_tokens == 0
        assert result.cost_usd == 0.0

    @patch("app.services.qa.search_similar_slides")
    def test_out_of_scope_saves_qa_log(self, mock_search, db):
        """out_of_scope 응답도 QALog에 저장된다."""
        mock_search.return_value = [
            RetrievalResult(slide_number=1, slide_id=1, text_content="내용", similarity=0.30),
        ]

        answer_question(db, "task123", "sess1", "질문")

        log = db.query(QALog).filter(QALog.session_id == "sess1").first()
        assert log is not None
        assert log.in_scope is False
        assert log.question == "질문"

    @patch("app.services.qa.anthropic.Anthropic")
    @patch("app.services.qa.search_similar_slides")
    def test_in_scope_calls_claude_and_returns_answer(self, mock_search, mock_anthropic_cls, db):
        """유사도 높으면 Claude API를 호출하고 답변을 반환한다."""
        mock_search.return_value = [
            RetrievalResult(slide_number=3, slide_id=3, text_content="머신러닝 내용", similarity=0.90),
            RetrievalResult(slide_number=7, slide_id=7, text_content="딥러닝 내용", similarity=0.82),
        ]
        from tests.conftest import make_claude_response
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("머신러닝은 AI의 하위 분야입니다.")

        result = answer_question(db, "task123", "sess2", "머신러닝이 뭔가요?")

        assert result.in_scope is True
        assert "머신러닝" in result.answer
        assert result.input_tokens == 100
        assert result.output_tokens == 50
        assert result.cost_usd > 0

    @patch("app.services.qa.anthropic.Anthropic")
    @patch("app.services.qa.search_similar_slides")
    def test_in_scope_saves_qa_log_with_cost(self, mock_search, mock_anthropic_cls, db):
        """in_scope 응답은 비용 정보와 함께 QALog에 저장된다."""
        mock_search.return_value = [
            RetrievalResult(slide_number=1, slide_id=1, text_content="내용", similarity=0.85),
        ]
        from tests.conftest import make_claude_response
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("답변")

        answer_question(db, "task456", "sess3", "질문")

        log = db.query(QALog).filter(QALog.session_id == "sess3").first()
        assert log is not None
        assert log.in_scope is True
        assert log.input_tokens == 100
        assert log.cost_usd > 0

    @patch("app.services.qa.anthropic.Anthropic")
    @patch("app.services.qa.search_similar_slides")
    def test_references_slide_numbers_in_log(self, mock_search, mock_anthropic_cls, db):
        """참조 슬라이드 번호가 올바르게 기록된다."""
        mock_search.return_value = [
            RetrievalResult(slide_number=3, slide_id=3, text_content="a", similarity=0.90),
            RetrievalResult(slide_number=7, slide_id=7, text_content="b", similarity=0.80),
            RetrievalResult(slide_number=12, slide_id=12, text_content="c", similarity=0.76),
        ]
        from tests.conftest import make_claude_response
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("답변")

        answer_question(db, "task789", "sess4", "질문")

        log = db.query(QALog).filter(QALog.session_id == "sess4").first()
        assert log.top_slide_numbers == "3,7,12"
        assert log.top_similarity == 0.90
