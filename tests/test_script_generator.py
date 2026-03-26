"""스크립트 생성 + 임베딩 서비스 테스트."""

from unittest.mock import MagicMock, patch

from app.models.schemas import SlideContent
from app.services.script_generator import generate_scripts
from tests.conftest import make_claude_response, make_embedding_response


class TestGenerateScripts:
    """Claude API 스크립트 생성 테스트."""

    @patch("app.services.script_generator.anthropic.Anthropic")
    def test_generates_script_for_each_slide(self, mock_anthropic_cls):
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("생성된 스크립트")

        slides = [
            SlideContent(slide_number=1, texts=["제목"], speaker_notes="노트1"),
            SlideContent(slide_number=2, texts=["내용"], speaker_notes="노트2"),
        ]

        scripts = generate_scripts(slides)

        assert len(scripts) == 2
        assert scripts[0].slide_number == 1
        assert scripts[0].script == "생성된 스크립트"
        assert scripts[1].slide_number == 2
        assert mock_client.messages.create.call_count == 2

    @patch("app.services.script_generator.anthropic.Anthropic")
    def test_speaker_notes_included_in_prompt(self, mock_anthropic_cls):
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("답변")

        slides = [
            SlideContent(slide_number=1, texts=["텍스트"], speaker_notes="중요한 발표 노트"),
        ]
        generate_scripts(slides)

        call_args = mock_client.messages.create.call_args
        user_content = call_args.kwargs["messages"][0]["content"]
        # 텍스트 블록에서 발표자 노트 참조 확인
        text_block = [b for b in user_content if b["type"] == "text"][0]
        assert "중요한 발표 노트" in text_block["text"]
        assert "1순위 참고" in text_block["text"]

    @patch("app.services.script_generator.anthropic.Anthropic")
    def test_empty_slide_gets_transition_hint(self, mock_anthropic_cls):
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client
        mock_client.messages.create.return_value = make_claude_response("전환")

        slides = [
            SlideContent(slide_number=1, texts=[], speaker_notes="", image_paths=[]),
        ]
        generate_scripts(slides)

        call_args = mock_client.messages.create.call_args
        text_block = [b for b in call_args.kwargs["messages"][0]["content"] if b["type"] == "text"][0]
        assert "빈 슬라이드" in text_block["text"]


class TestGetEmbeddings:
    """OpenAI 임베딩 서비스 테스트."""

    @patch("app.services.embedding.openai.OpenAI")
    def test_returns_embedding_vectors(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.embeddings.create.return_value = make_embedding_response(count=2, dim=8)

        from app.services.embedding import get_embeddings

        result = get_embeddings(["텍스트1", "텍스트2"])

        assert len(result) == 2
        assert len(result[0]) == 8
        assert len(result[1]) == 8
        mock_client.embeddings.create.assert_called_once()
