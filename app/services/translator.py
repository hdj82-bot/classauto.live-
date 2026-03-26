"""DeepL + Google Translate 폴백 번역 서비스.

DeepL 지원 언어 → DeepL 사용
미지원 언어   → Google Translate 자동 폴백
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)

# DeepL 지원 타겟 언어 코드 (2024-12 기준 주요 언어)
# DeepL은 대문자 코드 사용 (EN-US, ZH-HANS 등)
DEEPL_TARGET_LANGUAGES: dict[str, str] = {
    "en": "EN-US",
    "ja": "JA",
    "zh": "ZH-HANS",
    "de": "DE",
    "fr": "FR",
    "es": "ES",
    "it": "IT",
    "pt": "PT-BR",
    "nl": "NL",
    "pl": "PL",
    "ru": "RU",
    "ko": "KO",
    "id": "ID",
    "tr": "TR",
    "uk": "UK",
    "sv": "SV",
    "cs": "CS",
    "da": "DA",
    "fi": "FI",
    "el": "EL",
    "hu": "HU",
    "ro": "RO",
    "sk": "SK",
    "bg": "BG",
    "et": "ET",
    "lv": "LV",
    "lt": "LT",
    "sl": "SL",
    "nb": "NB",
    "ar": "AR",
}


@dataclass
class TranslationResult:
    text: str
    source_lang: str
    target_lang: str
    provider: str  # "deepl" | "google"


def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "ko",
) -> TranslationResult:
    """텍스트를 번역한다. DeepL 우선, 미지원 시 Google Translate 폴백."""
    if not text.strip():
        return TranslationResult(text="", source_lang=source_lang, target_lang=target_lang, provider="none")

    # DeepL 지원 언어인지 확인
    if target_lang in DEEPL_TARGET_LANGUAGES and settings.deepl_api_key:
        try:
            return _translate_deepl(text, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 실패, Google Translate로 폴백: %s", exc)

    # Google Translate 폴백
    return _translate_google(text, target_lang, source_lang)


def translate_batch(
    texts: list[str],
    target_lang: str,
    source_lang: str = "ko",
) -> list[TranslationResult]:
    """여러 텍스트를 한 번에 번역한다."""
    if not texts:
        return []

    # DeepL 배치 시도
    if target_lang in DEEPL_TARGET_LANGUAGES and settings.deepl_api_key:
        try:
            return _translate_deepl_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 배치 실패, Google Translate로 폴백: %s", exc)

    # Google Translate 폴백 (개별 호출)
    return [_translate_google(t, target_lang, source_lang) for t in texts]


# ---------------------------------------------------------------------------
# DeepL
# ---------------------------------------------------------------------------

def _translate_deepl(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    """DeepL API 단건 번역."""
    import deepl

    translator = deepl.Translator(settings.deepl_api_key)
    deepl_target = DEEPL_TARGET_LANGUAGES[target_lang]
    deepl_source = source_lang.upper()

    result = translator.translate_text(
        text,
        source_lang=deepl_source,
        target_lang=deepl_target,
    )

    logger.info("DeepL 번역 완료: %s → %s (%d자)", source_lang, target_lang, len(result.text))
    return TranslationResult(
        text=result.text,
        source_lang=source_lang,
        target_lang=target_lang,
        provider="deepl",
    )


def _translate_deepl_batch(
    texts: list[str], target_lang: str, source_lang: str
) -> list[TranslationResult]:
    """DeepL API 배치 번역."""
    import deepl

    translator = deepl.Translator(settings.deepl_api_key)
    deepl_target = DEEPL_TARGET_LANGUAGES[target_lang]
    deepl_source = source_lang.upper()

    results = translator.translate_text(
        texts,
        source_lang=deepl_source,
        target_lang=deepl_target,
    )

    logger.info("DeepL 배치 번역 완료: %s → %s (%d건)", source_lang, target_lang, len(results))
    return [
        TranslationResult(
            text=r.text,
            source_lang=source_lang,
            target_lang=target_lang,
            provider="deepl",
        )
        for r in results
    ]


# ---------------------------------------------------------------------------
# Google Translate
# ---------------------------------------------------------------------------

def _translate_google(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    """Google Cloud Translation API v2 단건 번역."""
    from google.cloud import translate_v2 as google_translate

    client = google_translate.Client()

    result = client.translate(
        text,
        target_language=target_lang,
        source_language=source_lang,
        format_="text",
    )

    translated = result["translatedText"]
    logger.info("Google Translate 번역 완료: %s → %s (%d자)", source_lang, target_lang, len(translated))
    return TranslationResult(
        text=translated,
        source_lang=source_lang,
        target_lang=target_lang,
        provider="google",
    )
