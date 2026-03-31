"""DeepL + Google Translate 폴백 번역 서비스."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)

DEEPL_TARGET_LANGUAGES: dict[str, str] = {
    "en": "EN-US", "ja": "JA", "zh": "ZH-HANS", "de": "DE", "fr": "FR",
    "es": "ES", "it": "IT", "pt": "PT-BR", "nl": "NL", "pl": "PL",
    "ru": "RU", "ko": "KO", "id": "ID", "tr": "TR", "uk": "UK",
    "sv": "SV", "cs": "CS", "da": "DA", "fi": "FI", "el": "EL",
    "hu": "HU", "ro": "RO", "sk": "SK", "bg": "BG", "et": "ET",
    "lv": "LV", "lt": "LT", "sl": "SL", "nb": "NB", "ar": "AR",
}


@dataclass
class TranslationResult:
    text: str
    source_lang: str
    target_lang: str
    provider: str


def translate_text(text: str, target_lang: str, source_lang: str = "ko") -> TranslationResult:
    if not text.strip():
        return TranslationResult(text="", source_lang=source_lang, target_lang=target_lang, provider="none")

    if target_lang in DEEPL_TARGET_LANGUAGES and settings.DEEPL_API_KEY:
        try:
            return _translate_deepl(text, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 실패, Google Translate로 폴백: %s", exc)

    return _translate_google(text, target_lang, source_lang)


def translate_batch(texts: list[str], target_lang: str, source_lang: str = "ko") -> list[TranslationResult]:
    if not texts:
        return []
    if target_lang in DEEPL_TARGET_LANGUAGES and settings.DEEPL_API_KEY:
        try:
            return _translate_deepl_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 배치 실패, Google Translate로 폴백: %s", exc)
    return [_translate_google(t, target_lang, source_lang) for t in texts]


def _translate_deepl(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    import deepl
    translator = deepl.Translator(settings.DEEPL_API_KEY)
    result = translator.translate_text(text, source_lang=source_lang.upper(), target_lang=DEEPL_TARGET_LANGUAGES[target_lang])
    return TranslationResult(text=result.text, source_lang=source_lang, target_lang=target_lang, provider="deepl")


def _translate_deepl_batch(texts: list[str], target_lang: str, source_lang: str) -> list[TranslationResult]:
    import deepl
    translator = deepl.Translator(settings.DEEPL_API_KEY)
    results = translator.translate_text(texts, source_lang=source_lang.upper(), target_lang=DEEPL_TARGET_LANGUAGES[target_lang])
    return [TranslationResult(text=r.text, source_lang=source_lang, target_lang=target_lang, provider="deepl") for r in results]


def _translate_google(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    from google.cloud import translate_v2 as google_translate
    client = google_translate.Client()
    result = client.translate(text, target_language=target_lang, source_language=source_lang, format_="text")
    return TranslationResult(text=result["translatedText"], source_lang=source_lang, target_lang=target_lang, provider="google")
