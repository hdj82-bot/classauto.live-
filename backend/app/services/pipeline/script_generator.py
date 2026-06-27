"""Claude API를 사용한 슬라이드별 발화 스크립트 생성."""
from __future__ import annotations

import logging
import mimetypes
import re
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

import anthropic

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.services.pipeline.parser import encode_image_base64
from app.services.pipeline.schemas import SlideContent, SlideScript
from app.services.pipeline.text_cleanup import (
    strip_cross_lang_gloss,
    strip_pinyin_annotations,
)
from app.services.pipeline.translator import _lang_name

logger = logging.getLogger(__name__)

# Claude SDK 자체 retry 와는 별개로, 우리 정책(3회·exp backoff·timeout 30s)을
# 강제하기 위해 anthropic.APIStatusError(5xx/429) 와 anthropic.APIConnectionError
# 를 명시적 재시도 대상으로 추가한다. 4xx 영구 오류는 BadRequestError 등으로
# 별도 분기되어 재시도하지 않는다.
_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)

SYSTEM_PROMPT = """\
당신은 전문 프레젠테이션 발표 코치입니다.
주어진 슬라이드 정보를 바탕으로 자연스러운 한국어 발화 스크립트를 작성하세요.

규칙:
1. 발표자 노트가 있으면 이를 1순위로 참고하여 스크립트를 작성합니다.
2. 발표자 노트가 없으면 슬라이드 텍스트와 이미지를 분석하여 스크립트를 생성합니다.
3. 구어체로 자연스럽게 작성합니다. (예: "~입니다", "~하겠습니다")
4. 슬라이드 전환 멘트는 포함하지 않습니다.
5. 1~2분 분량으로 작성합니다.

출력 형식 (매우 중요):
출력은 TTS(음성 합성)로 그대로 발화되는 평문입니다.
마크다운 문법(**굵게**, ##헤딩, `코드`, [링크](url), - 목록, > 인용 등)을 절대 사용하지 마세요.
중요한 단어를 강조할 때는 따옴표("")나 자연스러운 한국어 화법(예: "특히", "여기서 핵심은")으로 표현하세요.
중국어 단어·문장은 한자(중국어 글자)만 그대로 씁니다. 병음(로마자 발음 표기)이나
괄호로 발음을 병기하지 마세요. 음성 합성기가 한자를 중국어로 정확히 발음하므로,
괄호 안에 병음을 적으면 그 로마자까지 소리내어 읽어 발음이 깨집니다.

예시:
(O) 첫 번째 문장은 "他喜欢猫"입니다. 여기서 핵심은 동사 "喜欢"의 위치입니다.
(X) 첫 번째 문장은 "他(tā)喜欢(xǐhuān)猫(māo)"입니다.  ← 병음 병기 금지
(X) 첫 번째 문장은 **他喜欢猫** 입니다. 여기서 ##핵심은 동사 `喜欢`의 위치입니다.  ← 마크다운 금지
"""


# ── 마크다운 sanitizer ───────────────────────────────────────────────────────
# 시스템 프롬프트로 1차 차단해도 모델이 가끔 마크다운을 출력한다.
# TTS 가 별표·해시·백틱을 그대로 읽어버리는 사고를 막기 위한 2차 방어선.

_RE_BOLD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
# 단어 경계 lookaround 를 두지 않는다 — Unicode `\w` 에 한글·한자가 포함되어
# `__중요__한` 처럼 한국어 문맥에서는 절대 매치하지 않는다 (CI #496/497 회귀).
# Python dunder(`__init__`) 가 우연히 잡히는 false positive 는 TTS 스크립트
# 컨텍스트에서 허용한다 — 마크다운 강조가 음성으로 발화되는 사고가 더 위험.
_RE_ITALIC_UNDERSCORE = re.compile(r"__(.+?)__", re.DOTALL)
_RE_ITALIC_STAR = re.compile(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", re.DOTALL)
_RE_ITALIC_UNDER_SINGLE = re.compile(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", re.DOTALL)
_RE_INLINE_CODE = re.compile(r"`+([^`]+?)`+")
_RE_CODE_FENCE = re.compile(r"^```.*?$", re.MULTILINE)
_RE_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_RE_BLOCKQUOTE = re.compile(r"^\s{0,3}>\s?", re.MULTILINE)
_RE_HR = re.compile(r"^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$", re.MULTILINE)
_RE_LIST_BULLET = re.compile(r"^\s{0,3}[-*+]\s+", re.MULTILINE)
_RE_LIST_NUMBER = re.compile(r"^\s{0,3}\d+\.\s+", re.MULTILINE)
_RE_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_RE_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")


def _strip_markdown(text: str) -> str:
    """LLM 출력에서 마크다운 문법을 제거해 TTS 안전 평문으로 변환.

    문장 내용은 보존하고 표시 문법만 벗긴다. 강조(**굵게**, *기울임*) 는
    내용을 그대로 살리고, 목록 마커·헤딩 마커는 줄 앞에서만 제거한다.
    """
    if not text:
        return text

    text = _RE_CODE_FENCE.sub("", text)
    text = _RE_IMAGE.sub(r"\1", text)
    text = _RE_LINK.sub(r"\1", text)
    text = _RE_BOLD.sub(r"\1", text)
    text = _RE_ITALIC_UNDERSCORE.sub(r"\1", text)
    text = _RE_ITALIC_STAR.sub(r"\1", text)
    text = _RE_ITALIC_UNDER_SINGLE.sub(r"\1", text)
    text = _RE_INLINE_CODE.sub(r"\1", text)
    text = _RE_HEADING.sub("", text)
    text = _RE_BLOCKQUOTE.sub("", text)
    text = _RE_HR.sub("", text)
    text = _RE_LIST_BULLET.sub("", text)
    text = _RE_LIST_NUMBER.sub("", text)

    # 잔여 별표·백틱 안전망 (페어가 깨진 경우)
    text = text.replace("**", "").replace("`", "")

    # 연속된 빈 줄 압축 + 양 끝 공백 정리
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── 시스템 프롬프트 (prompt caching 형식) ────────────────────────────────────
# 슬라이드마다 동일한 system 텍스트라 cache_control="ephemeral" 로 표시해
# 두 번째 슬라이드부터는 cache_read_input_tokens 로 청구된다.

_SYSTEM_BLOCKS = [
    {
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    },
]


# ── 다국어 발화 스크립트 ──────────────────────────────────────────────────────
# voice_lang 이 한국어가 아니면, 슬라이드 내용을 '번역'이 아니라 해당 언어로
# 처음부터 네이티브 생성한다 (한국어를 거친 번역투·번역 오류 회피 — 교수자
# 결정 2026-06-12). 한국어 경로는 위 _SYSTEM_BLOCKS 를 그대로 써 기존 파이프라인과
# 100% 동일하게 유지하고(무회귀), 그 외 언어만 영어 지시문 프롬프트로 분기한다.


def _system_prompt_for_lang(lang_name: str) -> str:
    return f"""\
You are a professional presentation speaking coach.
Based on the given slide, write a natural spoken script in {lang_name}.

Rules:
1. If speaker notes exist, use them as the primary source.
2. Otherwise, analyze the slide text and images.
3. Write in a natural, conversational spoken style.
4. Do not include slide-transition phrases.
5. Keep it to about 1-2 minutes of speech.
6. Write the ENTIRE script in {lang_name}; do not mix in other languages except
   for quoted terms.

Output format (very important):
The output is plain text spoken verbatim by a TTS engine.
Never use markdown (**bold**, ## heading, `code`, [link](url), - list, > quote).
For Chinese words/sentences, write only the Han characters — never annotate pinyin
or pronunciation in parentheses, because the TTS would read the romanization aloud."""


def _system_blocks_for_lang(lang: str | None) -> list[dict]:
    """언어별 system 블록. ko/None 은 기존 한국어 프롬프트 그대로(무회귀)."""
    if not lang or lang == "ko":
        return _SYSTEM_BLOCKS
    return [
        {
            "type": "text",
            "text": _system_prompt_for_lang(_lang_name(lang)),
            "cache_control": {"type": "ephemeral"},
        },
    ]


def generate_scripts(
    slides: list[SlideContent], lang: str = "ko", usage_sink: list | None = None
) -> list[SlideScript]:
    """모든 슬라이드에 대해 발화 스크립트를 병렬 생성.

    - 첫 슬라이드는 동기 호출로 먼저 끝내 사용자가 가장 먼저 보는 화면을
      가장 빨리 채운다(첫 호출이 prompt cache 도 적재해준다).
    - 나머지는 SCRIPT_CONCURRENCY 상한의 ThreadPoolExecutor 로 병렬화.
    - slide_number 순서를 보장해 반환.
    - ``lang`` 은 발화 언어(ko/en/zh/ja). 기본 ko 라 업로드 파이프라인(step3)은
      종전과 동일하게 한국어로 생성된다.
    """
    # 명시적 timeout 30s — anthropic SDK 의 with_options 로 호출별 한도 부과.
    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY, timeout=30.0,
    )

    if not slides:
        return []

    results: dict[int, str] = {}

    first, rest = slides[0], slides[1:]
    results[first.slide_number] = _generate_single_script(
        client, first, lang=lang, usage_sink=usage_sink
    )
    logger.info("슬라이드 %d 스크립트 생성 완료 (priming)", first.slide_number)

    if rest:
        max_workers = max(1, min(settings.SCRIPT_CONCURRENCY, len(rest)))
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            future_to_slide: dict[Future, SlideContent] = {
                pool.submit(
                    _generate_single_script, client, slide, lang=lang,
                    usage_sink=usage_sink,
                ): slide
                for slide in rest
            }
            for fut in future_to_slide:
                slide = future_to_slide[fut]
                results[slide.slide_number] = fut.result()
                logger.info("슬라이드 %d 스크립트 생성 완료", slide.slide_number)

    return [
        SlideScript(slide_number=s.slide_number, script=results[s.slide_number])
        for s in slides
    ]


@track_external_api("claude")
@retry_external(label="claude.messages.create", extra_retry_on=_RETRY_ON)
def claude_cost_usd(usages: list) -> float:
    """usage dict 리스트(``_generate_single_script`` 의 usage_sink)의 Claude 비용 합계(USD).

    토큰 값이 비정상(테스트 mock 등)이면 0 을 반환한다 — 비용 기록은 회계 보조이며
    파이프라인 흐름을 막지 않는다. 캐시 토큰은 입력 단가로 근사 합산한다.
    """
    try:
        ti = sum(
            int(u.get("input", 0) or 0)
            + int(u.get("cache_read", 0) or 0)
            + int(u.get("cache_write", 0) or 0)
            for u in usages
        )
        to = sum(int(u.get("output", 0) or 0) for u in usages)
        return round(
            (ti * settings.CLAUDE_INPUT_COST_PER_M + to * settings.CLAUDE_OUTPUT_COST_PER_M)
            / 1_000_000,
            6,
        )
    except Exception:  # noqa: BLE001 — mock/비정상 usage 는 0 으로.
        return 0.0


def _generate_single_script(
    client: anthropic.Anthropic, slide: SlideContent, lang: str = "ko",
    usage_sink: list | None = None,
) -> str:
    content_blocks: list[dict] = []

    for img_path in slide.image_paths:
        path = Path(img_path)
        if path.exists():
            try:
                mime_type = mimetypes.guess_type(img_path)[0] or "image/png"
                data = encode_image_base64(img_path)
                content_blocks.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime_type, "data": data},
                })
            except Exception:
                logger.warning("이미지 인코딩 실패, 건너뜀: %s", img_path)

    prompt_parts: list[str] = [f"## 슬라이드 {slide.slide_number}"]
    if slide.speaker_notes:
        prompt_parts.append(f"\n### 발표자 노트 (1순위 참고)\n{slide.speaker_notes}")
    if slide.texts:
        prompt_parts.append("\n### 슬라이드 텍스트\n" + "\n".join(slide.texts))
    if not slide.speaker_notes and not slide.texts and not slide.image_paths:
        prompt_parts.append("\n(빈 슬라이드입니다. 간단한 전환 멘트만 작성하세요.)")
    if not lang or lang == "ko":
        prompt_parts.append("\n위 내용을 바탕으로 발화 스크립트를 작성해주세요.")
    else:
        prompt_parts.append(
            f"\nBased on the above, write the spoken script in {_lang_name(lang)}."
        )

    content_blocks.append({"type": "text", "text": "\n".join(prompt_parts)})

    try:
        response = client.messages.create(
            model=settings.SCRIPT_MODEL,
            max_tokens=settings.SCRIPT_MAX_TOKENS,
            system=_system_blocks_for_lang(lang),
            messages=[{"role": "user", "content": content_blocks}],
        )
    except anthropic.APIError as exc:
        logger.error("슬라이드 %d 스크립트 생성 실패: %s", slide.slide_number, exc)
        raise RuntimeError(
            f"슬라이드 {slide.slide_number} 스크립트 생성 실패: {exc}"
        ) from exc

    usage = getattr(response, "usage", None)
    if usage is not None:
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        logger.debug(
            "슬라이드 %d usage: input=%s output=%s cache_read=%s cache_write=%s",
            slide.slide_number,
            getattr(usage, "input_tokens", "?"),
            getattr(usage, "output_tokens", "?"),
            cache_read,
            cache_write,
        )
        # H1: 호출부(step3·재생성)가 usage_sink 를 넘기면 토큰 사용량을 적립한다.
        # list.append 는 GIL 하에서 thread-safe — generate_scripts 의 병렬 풀에서 안전.
        if usage_sink is not None:
            usage_sink.append({
                "input": getattr(usage, "input_tokens", 0) or 0,
                "output": getattr(usage, "output_tokens", 0) or 0,
                "cache_read": cache_read,
                "cache_write": cache_write,
            })

    if not response.content:
        logger.warning("슬라이드 %d: 빈 응답", slide.slide_number)
        return "(스크립트를 생성할 수 없었습니다.)"

    text_block = next((b for b in response.content if b.type == "text"), None)
    if text_block is None:
        logger.warning("슬라이드 %d: 텍스트 블록 없음", slide.slide_number)
        return "(스크립트를 생성할 수 없었습니다.)"

    # 마크다운 제거 + (프롬프트로 1차 차단해도 모델이 가끔 넣는) 한자 뒤 병음
    # 괄호 표기 제거 + '한국어(중국어)'·'중국어(한국어)' 병기 괄호 제거 — 저장·표시·
    # 합성 모두 한 언어 단어만 남도록 보장(교수자 요청).
    return strip_cross_lang_gloss(
        strip_pinyin_annotations(_strip_markdown(text_block.text))
    )
