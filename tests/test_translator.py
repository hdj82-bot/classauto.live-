"""번역 모듈 테스트 — DeepL 우선 + Google Translate 폴백."""

from unittest.mock import MagicMock, patch

from app.services.translator import (
    DEEPL_TARGET_LANGUAGES,
    TranslationResult,
    translate_batch,
    translate_text,
)


class TestTranslateText:
    """단건 번역 테스트."""

    @patch("app.services.translator._translate_deepl")
    def test_deepl_used_for_supported_language(self, mock_deepl):
        mock_deepl.return_value = TranslationResult(
            text="Hello", source_lang="ko", target_lang="en", provider="deepl"
        )

        result = translate_text("안녕하세요", target_lang="en")

        assert result.provider == "deepl"
        assert result.text == "Hello"
        mock_deepl.assert_called_once()

    @patch("app.services.translator._translate_google")
    def test_google_used_for_unsupported_language(self, mock_google):
        mock_google.return_value = TranslationResult(
            text="Xin chào", source_lang="ko", target_lang="vi", provider="google"
        )

        result = translate_text("안녕하세요", target_lang="vi")

        assert result.provider == "google"
        assert result.text == "Xin chào"
        mock_google.assert_called_once()

    @patch("app.services.translator._translate_google")
    @patch("app.services.translator._translate_deepl")
    def test_fallback_to_google_on_deepl_failure(self, mock_deepl, mock_google):
        mock_deepl.side_effect = Exception("DeepL API 오류")
        mock_google.return_value = TranslationResult(
            text="Hello", source_lang="ko", target_lang="en", provider="google"
        )

        result = translate_text("안녕하세요", target_lang="en")

        assert result.provider == "google"
        assert result.text == "Hello"
        mock_deepl.assert_called_once()
        mock_google.assert_called_once()

    def test_empty_text_returns_none_provider(self):
        result = translate_text("", target_lang="en")
        assert result.provider == "none"
        assert result.text == ""

    def test_vi_not_in_deepl_languages(self):
        assert "vi" not in DEEPL_TARGET_LANGUAGES

    def test_en_in_deepl_languages(self):
        assert "en" in DEEPL_TARGET_LANGUAGES


class TestTranslateBatch:
    """배치 번역 테스트."""

    @patch("app.services.translator._translate_deepl_batch")
    def test_batch_deepl_for_supported_language(self, mock_batch):
        mock_batch.return_value = [
            TranslationResult(text="Hello", source_lang="ko", target_lang="en", provider="deepl"),
            TranslationResult(text="World", source_lang="ko", target_lang="en", provider="deepl"),
        ]

        results = translate_batch(["안녕", "세계"], target_lang="en")

        assert len(results) == 2
        assert all(r.provider == "deepl" for r in results)

    @patch("app.services.translator._translate_google")
    def test_batch_google_for_unsupported_language(self, mock_google):
        mock_google.return_value = TranslationResult(
            text="translated", source_lang="ko", target_lang="vi", provider="google"
        )

        results = translate_batch(["텍스트1", "텍스트2"], target_lang="vi")

        assert len(results) == 2
        assert all(r.provider == "google" for r in results)
        assert mock_google.call_count == 2

    @patch("app.services.translator._translate_google")
    @patch("app.services.translator._translate_deepl_batch")
    def test_batch_fallback_on_deepl_failure(self, mock_deepl_batch, mock_google):
        mock_deepl_batch.side_effect = Exception("DeepL 배치 실패")
        mock_google.return_value = TranslationResult(
            text="fallback", source_lang="ko", target_lang="en", provider="google"
        )

        results = translate_batch(["텍스트"], target_lang="en")

        assert len(results) == 1
        assert results[0].provider == "google"

    def test_empty_list_returns_empty(self):
        results = translate_batch([], target_lang="en")
        assert results == []
