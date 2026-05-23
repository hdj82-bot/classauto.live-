"""Claude(기본) + DeepL/Google(폴백) 번역 서비스.

자막 번역은 텍스트→텍스트라 Claude Haiku 단일 호출이 가장 빠르고, 이미 검증된
``ANTHROPIC_API_KEY`` 만 있으면 동작한다(DeepL/Google 자격증명 불필요). 따라서
Claude 를 1순위로 두고, 실패 시에만 DeepL→Google 로 폴백한다.
"""
from __future__ import annotations

import json
import logging
import re
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

    # 1순위: Claude — 단일 호출, 빠름, ANTHROPIC_API_KEY 만 있으면 동작.
    if settings.ANTHROPIC_API_KEY:
        try:
            return _translate_claude_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("Claude 번역 실패, DeepL/Google로 폴백: %s", exc)

    # 2순위: DeepL (키가 있고 지원 언어일 때만).
    if target_lang in DEEPL_TARGET_LANGUAGES and settings.DEEPL_API_KEY:
        try:
            return _translate_deepl_batch(texts, target_lang, source_lang)
        except Exception as exc:
            logger.warning("DeepL 배치 실패, Google Translate로 폴백: %s", exc)

    # 3순위: Google Translate (자격증명 필요).
    return [_translate_google(t, target_lang, source_lang) for t in texts]


@track_external_api("claude")
def _translate_claude_batch(
    texts: list[str], target_lang: str, source_lang: str
) -> list[TranslationResult]:
    """전체 세그먼트를 Claude 1회 호출로 번역한다(순서·개수 보존).

    입력을 ``[{"id": i, "text": ...}]`` JSON 으로 주고 같은 형태의 JSON 배열을
    돌려받아 id 로 정렬한다. 개수가 안 맞거나 파싱 실패 시 예외를 던져
    상위에서 DeepL/Google 로 폴백하게 한다.
    """
    import anthropic

    src, tgt = _lang_name(source_lang), _lang_name(target_lang)
    logger.info(
        "Claude 번역 요청: %s→%s, segments=%d, total_chars=%d",
        source_lang, target_lang, len(texts), sum(len(t) for t in texts),
    )

    payload = json.dumps(
        [{"id": i, "text": t} for i, t in enumerate(texts)], ensure_ascii=False
    )
    system = (
        f"You are a professional lecture-subtitle translator. Translate each item's "
        f"`text` from {src} to {tgt}. Translate faithfully and naturally for spoken "
        f"lecture delivery, preserving meaning, tone, numbers, and proper nouns. "
        f"Return ONLY a JSON array of objects with keys \"id\" (the same integer) and "
        f"\"text\" (the translation), in the same order and exact same count as the "
        f"input. Never merge, split, add, drop, or renumber items. If an item is empty, "
        f"return an empty string. Output JSON only — no markdown, no commentary."
    )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    response = client.messages.create(
        model=settings.TRANSLATE_MODEL,
        max_tokens=settings.TRANSLATE_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": payload}],
    )

    raw = "".join(
        b.text for b in response.content if getattr(b, "type", None) == "text"
    ).strip()
    items = _parse_json_array(raw)
    by_id: dict[int, str] = {
        int(it["id"]): str(it.get("text", ""))
        for it in items
        if isinstance(it, dict) and "id" in it
    }
    if len(by_id) != len(texts):
        raise ValueError(
            f"Claude 번역 개수 불일치: got {len(by_id)}, want {len(texts)}"
        )

    return [
        TranslationResult(
            text=by_id[i], source_lang=source_lang, target_lang=target_lang,
            provider="claude",
        )
        for i in range(len(texts))
    ]


def _parse_json_array(raw: str) -> list:
    """모델 응답에서 JSON 배열을 추출한다. 코드펜스/잡설이 섞여도 견디게."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    # ```json ... ``` 펜스 제거 후 첫 번째 [ ... ] 블록을 시도.
    fenced = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    match = re.search(r"\[.*\]", fenced, flags=re.DOTALL)
    if match:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, list):
            return parsed
    raise ValueError("Claude 응답에서 JSON 배열을 찾지 못함")


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
