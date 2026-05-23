"""Claude(기본) + DeepL/Google(폴백) 번역 서비스.

자막 번역은 텍스트→텍스트라 Claude Haiku 가 가장 빠르고, 이미 검증된
``ANTHROPIC_API_KEY`` 만 있으면 동작한다(DeepL/Google 자격증명 불필요). 따라서
Claude 를 1순위로 둔다.

**슬라이드별 병렬 호출**한다 — 전체 스크립트(수천 자)를 1회로 묶으면 출력이
30s 타임아웃을 넘겨 실패하고, 이어 폴백이 hang 되는 문제가 있었다. 각 세그먼트는
작아 1회 호출이 빠르게 끝나며, 동시 실행으로 전체 시간도 짧다(스크립트 생성과
동일한 ThreadPoolExecutor 패턴).
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from app.core.config import settings
from app.core.metrics import track_external_api

logger = logging.getLogger(__name__)

DEEPL_TARGET_LANGUAGES: dict[str, str] = {
    "en": "EN-US", "ja": "JA", "zh": "ZH-HANS", "de": "DE", "fr": "FR",
    "es": "ES", "it": "IT", "pt": "PT-BR", "nl": "NL", "pl": "PL",
    "ru": "RU", "ko": "KO", "id": "ID", "tr": "TR", "uk": "UK",
    "sv": "SV", "cs": "CS", "da": "DA", "fi": "FI", "el": "EL",
    "hu": "HU", "ro": "RO", "sk": "SK", "bg": "BG", "et": "ET",
    "lv": "LV", "lt": "LT", "sl": "SL", "nb": "NB", "ar": "AR",
}

# Claude 프롬프트에 넣을 사람이 읽는 언어명. 코드만 던지면 모델이 헷갈리므로 명시.
LANG_NAMES: dict[str, str] = {
    "ko": "Korean", "zh": "Chinese (Simplified)", "en": "English",
    "ja": "Japanese", "de": "German", "fr": "French", "ru": "Russian",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese",
}


def _lang_name(code: str) -> str:
    return LANG_NAMES.get(code, code)


@dataclass
class TranslationResult:
    text: str
    source_lang: str
    target_lang: str
    provider: str


def translate_text(text: str, target_lang: str, source_lang: str = "ko") -> TranslationResult:
    if not text.strip():
        return TranslationResult(text="", source_lang=source_lang, target_lang=target_lang, provider="none")
    return translate_batch([text], target_lang, source_lang)[0]


def translate_batch(texts: list[str], target_lang: str, source_lang: str = "ko") -> list[TranslationResult]:
    if not texts:
        return []

    # 1순위: Claude — 슬라이드별 병렬 호출. ANTHROPIC_API_KEY 만 있으면 동작.
    if settings.ANTHROPIC_API_KEY:
        try:
            return _translate_claude_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("Claude 번역 실패, 폴백 시도: %s", exc)

    # 2순위: DeepL (키가 있고 지원 언어일 때만).
    if target_lang in DEEPL_TARGET_LANGUAGES and settings.DEEPL_API_KEY:
        try:
            return _translate_deepl_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 배치 실패: %s", exc)

    # 3순위: Google Translate — 자격증명이 구성된 경우에만(GOOGLE_TRANSLATE_ENABLED).
    # 미구성 상태에서 google.cloud Client() 를 만들면 GCE 메타데이터 서버 조회로
    # 무한 대기(요청 hang)하므로 절대 호출하지 않는다.
    if settings.GOOGLE_TRANSLATE_ENABLED:
        return [_translate_google(t, target_lang, source_lang) for t in texts]

    raise RuntimeError(
        "번역 실패: Claude 호출이 실패했고 구성된 폴백 번역기(DeepL/Google)가 없습니다."
    )


def _translate_claude_batch(
    texts: list[str], target_lang: str, source_lang: str
) -> list[TranslationResult]:
    """세그먼트별 Claude 호출을 동시 실행해 번역한다(순서 보존).

    각 호출이 슬라이드 1장 분량이라 빠르게 끝나며, 타임아웃·재시도 폭주가 없다.
    하나라도 실패하면 예외를 전파해 상위에서 폴백/에러 처리하게 한다.
    """
    import anthropic

    logger.info(
        "Claude 번역 요청: %s→%s, segments=%d, total_chars=%d (병렬)",
        source_lang, target_lang, len(texts), sum(len(t) for t in texts),
    )
    # max_retries=1: 타임아웃 시 SDK 기본 2회 재시도(×3) 로 90s 가까이 매달리던 것을 축소.
    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY, timeout=30.0, max_retries=1,
    )
    workers = max(1, min(settings.TRANSLATE_CONCURRENCY, len(texts)))
    results: list[TranslationResult | None] = [None] * len(texts)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_idx = {
            pool.submit(_translate_claude_one, client, t, target_lang, source_lang): i
            for i, t in enumerate(texts)
        }
        for future in future_to_idx:
            idx = future_to_idx[future]
            results[idx] = future.result()  # 예외는 그대로 전파
    return [r for r in results if r is not None]


@track_external_api("claude")
def _translate_claude_one(
    client, text: str, target_lang: str, source_lang: str
) -> TranslationResult:
    """세그먼트 1개 번역 — 평문만 반환(JSON 파싱 없음)."""
    if not text.strip():
        return TranslationResult(
            text="", source_lang=source_lang, target_lang=target_lang, provider="claude",
        )

    src, tgt = _lang_name(source_lang), _lang_name(target_lang)
    system = (
        f"You are a professional lecture-subtitle translator. Translate the user's "
        f"message from {src} to {tgt}. Output ONLY the translation as plain text — no "
        f"quotes, no markdown, no commentary, no notes. Preserve meaning, tone, numbers, "
        f"and proper nouns, and keep it natural for spoken lecture delivery."
    )
    response = client.messages.create(
        model=settings.TRANSLATE_MODEL,
        max_tokens=settings.TRANSLATE_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": text}],
    )
    out = "".join(
        b.text for b in response.content if getattr(b, "type", None) == "text"
    ).strip()
    return TranslationResult(
        text=out, source_lang=source_lang, target_lang=target_lang, provider="claude",
    )


@track_external_api("deepl")
def _translate_deepl(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    import deepl
    logger.info("DeepL 번역 요청: %s→%s, text_length=%d", source_lang, target_lang, len(text))
    translator = deepl.Translator(settings.DEEPL_API_KEY)
    result = translator.translate_text(text, source_lang=source_lang.upper(), target_lang=DEEPL_TARGET_LANGUAGES[target_lang])
    logger.debug("DeepL 번역 완료: result_length=%d", len(result.text))
    return TranslationResult(text=result.text, source_lang=source_lang, target_lang=target_lang, provider="deepl")


@track_external_api("deepl")
def _translate_deepl_batch(texts: list[str], target_lang: str, source_lang: str) -> list[TranslationResult]:
    import deepl
    translator = deepl.Translator(settings.DEEPL_API_KEY)
    results = translator.translate_text(texts, source_lang=source_lang.upper(), target_lang=DEEPL_TARGET_LANGUAGES[target_lang])
    return [TranslationResult(text=r.text, source_lang=source_lang, target_lang=target_lang, provider="deepl") for r in results]


@track_external_api("google_translate")
def _translate_google(text: str, target_lang: str, source_lang: str) -> TranslationResult:
    from google.cloud import translate_v2 as google_translate
    logger.info("Google Translate 요청: %s→%s, text_length=%d", source_lang, target_lang, len(text))
    client = google_translate.Client()
    result = client.translate(text, target_language=target_lang, source_language=source_lang, format_="text")
    logger.debug("Google Translate 완료: result_length=%d", len(result["translatedText"]))
    return TranslationResult(text=result["translatedText"], source_lang=source_lang, target_lang=target_lang, provider="google")
