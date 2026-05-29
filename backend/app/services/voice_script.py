"""본인 음성 녹음용 대본 생성 — Claude로 학술 산문(~500자)을 만든다.

교수자가 ElevenLabs Instant Voice Cloning(IVC) 용 샘플을 녹음할 때 읽을 대본을
생성한다. IVC 는 1분 내외의 자연스러운 발화 샘플이면 충분하므로, 낭독하기
좋은 한 편의 학술 산문(목록·표 없이 이어지는 단락)을 ``language`` 에 맞춰 만든다
(ko·en·zh·ja).

모델 정책(config.py · [[classauto-live-model-policy]]):
- "속도 최우선" — 대본 생성은 짧은 단발 호출이므로 가장 빠르고 싼 최신 Haiku
  (``settings.VOICE_SCRIPT_MODEL``)를 전용으로 쓰고, ``max_tokens`` 도 대본 길이에
  맞춰 타이트하게(``VOICE_SCRIPT_MAX_TOKENS``) 잡는다. thinking 은 쓰지 않는다.
- Anthropic 계정의 동시 연결 한도가 낮아, 슬라이드 스크립트처럼 병렬화하지 않고
  **단발 호출**로 처리한다. 일시적 5xx/429/timeout 은 ``retry_external`` 백오프가
  흡수한다.

비용은 1회성·소액이라 별도 회계 테이블(CostLog 는 lecture_id 필수, 본 호출은
강의에 매이지 않음) 대신 구조화 로그로 계측한다.
"""
from __future__ import annotations

import logging
import random

import anthropic

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external

# TTS/낭독 안전 평문 sanitizer 를 슬라이드 스크립트 생성기와 공유한다 — 마크다운
# 잔여 문법과 한자 뒤 병음 괄호를 제거해 "읽는 그대로" 깨끗한 대본을 보장한다.
from app.services.pipeline.script_generator import _strip_markdown
from app.services.pipeline.text_cleanup import strip_pinyin_annotations

logger = logging.getLogger(__name__)

# 슬라이드 스크립트 생성기와 동일한 명시적 재시도 대상(5xx/429/timeout/connection).
# 4xx 영구 오류(BadRequestError 등)는 재시도하지 않는다.
_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)

DEFAULT_LANGUAGE = "ko"


class VoiceScriptError(RuntimeError):
    """대본 생성 실패(외부 API 오류·빈 응답 등). 엔드포인트가 사용자에게 표면화."""


# ── 언어별 프롬프트 구성 ──────────────────────────────────────────────────────
# 각 언어의 system/user 프롬프트를 그 언어로 작성해, 모델이 해당 언어로 응답하게
# 한다. system 텍스트는 언어별로 고정이라 prompt caching(cache_control)이 언어별로
# 적중한다. angles/themes 는 호출마다 무작위로 하나를 골라 user 프롬프트에 주입해
# 결과를 변형시킨다(temperature 와 함께).

_KO_SYSTEM = """\
당신은 한국 대학의 학술 글쓰기에 능한 작가입니다. 교수자가 자신의 목소리를
복제(voice cloning)하기 위해 소리 내어 읽을 **녹음용 대본**을 작성합니다.

작성 규칙:
1. 한국어로, 한 편의 자연스러운 학술 산문을 작성합니다(공백 포함 약 500자, 450~550자).
2. 낭독하기 좋아야 합니다 — 길이가 적당히 변주된 완결된 문장으로, 2~3개 단락으로
   이어 씁니다. 너무 짧은 문장만 나열하거나 한 문장으로 길게 늘이지 않습니다.
3. 차분하고 지적인 어조의 문어체를 쓰되, 입으로 읽을 때 막힘이 없어야 합니다.
4. 사실의 정확성보다 낭독 품질이 중요합니다 — 특정 통계·날짜·고유명사를 지어내지 말고
   일반론 수준의 서술로 자연스럽게 풀어 씁니다.

출력 형식(매우 중요):
- 출력은 그대로 낭독되는 평문입니다. 제목·머리말·메타설명("다음은 ~입니다" 등)을
  붙이지 말고, 대본 본문만 출력하세요.
- 마크다운 문법(**굵게**, ##헤딩, - 목록, > 인용, `코드`, [링크])을 절대 쓰지 마세요.
- 중국어 단어·문장은 한자만 그대로 쓰고, 병음(로마자 발음)이나 괄호 발음 병기를
  하지 마세요. 음성 합성·녹음 시 괄호 안 로마자까지 읽혀 발음이 깨집니다.
"""

_EN_SYSTEM = """\
You are a skilled academic writer at a university. You write a short SCRIPT that a
professor will READ ALOUD to clone their own voice (voice cloning).

Rules:
1. Write in English as a single natural passage of academic prose
   (about 200-240 words, a one-to-two minute read aloud — long enough to match a
   ~500-character Korean script, NOT a short paragraph).
2. It must read aloud smoothly: complete sentences of varied length, in 3-4
   paragraphs. Avoid choppy fragments or one endless sentence.
3. Use a calm, intelligent written register that is still easy to speak.
4. Reading quality matters more than factual accuracy: do not invent specific
   statistics, dates, or proper nouns; keep it at a general level.

Output format (very important):
- The output is read verbatim. Do not add a title, preamble, or meta description
  ("The following is ..."). Output only the script body.
- Never use markdown (**bold**, ## headings, - lists, > quotes, `code`, [links]).
"""

_ZH_SYSTEM = """\
你是一位擅长学术写作的大学作者。请撰写一段教授将朗读以克隆其本人声音
（voice cloning）的录音稿。

规则：
1. 用中文写成一段自然的学术散文（约500字，450~550字）。
2. 必须朗读顺畅：句子长短适中、结构完整，分成2~3个自然段；不要全是短句，也不要一句到底。
3. 语气沉稳、富有学理，但读起来不拗口。
4. 朗读质量比事实准确性更重要：不要编造具体的统计数字、日期或专有名词，保持在一般论述层面。

输出格式（非常重要）：
- 输出将被逐字朗读。不要添加标题、引言或元说明（如“以下是……”），只输出正文。
- 绝不使用 Markdown（**加粗**、## 标题、- 列表、> 引用、`代码`、[链接]）。
- 不要为汉字标注拼音或在括号中注音。
"""

_JA_SYSTEM = """\
あなたは大学の学術的な文章に長けた書き手です。教授が自分の声を複製
（voice cloning）するために音読する「録音用原稿」を作成します。

ルール：
1. 日本語で、自然な学術的散文を一編書きます（約500字、450〜550字）。
2. 音読しやすいこと：長短のある完結した文で、2〜3段落にまとめます。短文の羅列や
   一文の長すぎる文は避けます。
3. 落ち着いた知的な書き言葉で、声に出して読んでもつかえないように。
4. 事実の正確さより音読の質を優先します：具体的な統計・日付・固有名詞を作らず、
   一般論として書きます。

出力形式（重要）：
- 出力はそのまま音読されます。タイトルや前置き、メタ説明（「以下は〜です」など）を
  付けず、原稿本文のみを出力してください。
- マークダウン（**太字**、##見出し、- 箇条書き、> 引用、`コード`、[リンク]）は
  絶対に使わないでください。
"""

# 언어별: (system, topic 프롬프트 템플릿, general 프롬프트 템플릿, 각도 풀, 주제 풀)
# 템플릿은 .format(topic=..., angle=...) / .format(theme=...) 로 채운다.
_LANG = {
    "ko": {
        "system": _KO_SYSTEM,
        "topic": (
            '강의 주제: "{topic}"\n\n'
            "위 주제와 연관된 한국어 학술 산문을 작성하세요. 이번에는 '{angle}' "
            "형태로 써 주세요. 약 500자(450~550자)의 낭독용 대본 본문만 출력합니다."
        ),
        "general": (
            "'{theme}'를 주제로 한국어 학술 산문을 작성하세요. 약 500자"
            "(450~550자)의 낭독용 대본 본문만 출력합니다."
        ),
        "angles": [
            "이 주제의 학문적 의의와 배경을 소개하는 도입부",
            "핵심 개념을 정의하고 그 중요성을 설명하는 단락",
            "이 주제를 공부할 때 유념할 관점이나 접근 방법",
            "구체적인 사례나 비유를 들어 풀어 주는 설명",
            "이 주제가 다른 분야와 맺는 연결과 확장 가능성",
            "학습자가 흥미를 갖도록 질문을 던지며 여는 서술",
        ],
        "themes": [
            "학문을 대하는 태도와 탐구의 즐거움",
            "언어와 사고가 서로를 빚어 가는 방식",
            "배움이 한 사람의 시야를 넓히는 과정",
            "지식이 세대를 거쳐 축적되고 전승되는 일",
            "비판적으로 읽고 스스로 질문하는 습관",
            "서로 다른 학문이 만나 새로운 통찰을 낳는 순간",
        ],
    },
    "en": {
        "system": _EN_SYSTEM,
        "topic": (
            'Lecture topic: "{topic}"\n\n'
            "Write English academic prose related to the topic above. This time, "
            "write it as {angle}. Output only the script body, about 200-240 words "
            "(a one-to-two minute read aloud)."
        ),
        "general": (
            'Write English academic prose on the theme of "{theme}". Output only '
            "the script body, about 200-240 words (a one-to-two minute read aloud)."
        ),
        "angles": [
            "an introduction to the topic's scholarly significance and background",
            "a paragraph defining the core concept and why it matters",
            "a perspective or approach to keep in mind when studying it",
            "an explanation using a concrete example or analogy",
            "how the topic connects to and extends into other fields",
            "an opening that raises a question to spark the learner's interest",
        ],
        "themes": [
            "the attitude of scholarship and the joy of inquiry",
            "the way language and thought shape one another",
            "how learning widens a person's horizons",
            "how knowledge accumulates and is passed down across generations",
            "the habit of reading critically and asking one's own questions",
            "the moment different disciplines meet to yield new insight",
        ],
    },
    "zh": {
        "system": _ZH_SYSTEM,
        "topic": (
            "讲课主题：“{topic}”\n\n"
            "请围绕上述主题撰写中文学术散文。这次请以“{angle}”的方式来写。"
            "只输出约500字（450~550字）的朗读正文。"
        ),
        "general": (
            "请以“{theme}”为主题撰写中文学术散文。"
            "只输出约500字（450~550字）的朗读正文。"
        ),
        "angles": [
            "介绍该主题学术意义与背景的导入段",
            "界定核心概念并说明其重要性的段落",
            "学习该主题时应留意的视角或方法",
            "借助具体事例或比喻展开的说明",
            "该主题与其他领域的联系与延伸",
            "以提问开篇、引发学习兴趣的叙述",
        ],
        "themes": [
            "治学的态度与探究的乐趣",
            "语言与思维彼此塑造的方式",
            "学习如何拓宽一个人的视野",
            "知识如何代代积累与传承",
            "批判性阅读、独立提问的习惯",
            "不同学科相遇而生新见的时刻",
        ],
    },
    "ja": {
        "system": _JA_SYSTEM,
        "topic": (
            "講義テーマ：「{topic}」\n\n"
            "上記のテーマに関連する日本語の学術的散文を書いてください。今回は"
            "「{angle}」の形で書いてください。約500字（450〜550字）の音読用原稿の"
            "本文のみを出力します。"
        ),
        "general": (
            "「{theme}」をテーマに日本語の学術的散文を書いてください。約500字"
            "（450〜550字）の音読用原稿の本文のみを出力します。"
        ),
        "angles": [
            "そのテーマの学術的意義と背景を紹介する導入",
            "中心概念を定義し、その重要性を説明する段落",
            "そのテーマを学ぶ際に留意すべき観点や方法",
            "具体的な事例や比喩を用いた説明",
            "そのテーマが他分野と結びつき広がる可能性",
            "問いを投げかけて学習者の興味を引く書き出し",
        ],
        "themes": [
            "学問に向き合う態度と探究の楽しさ",
            "言語と思考が互いを形づくるあり方",
            "学びが人の視野を広げていく過程",
            "知識が世代を超えて蓄積され受け継がれること",
            "批判的に読み、自ら問いを立てる習慣",
            "異なる学問が出会って新たな洞察を生む瞬間",
        ],
    },
}

# 언어별 system 블록(prompt caching 표시). 모듈 로드 시 1회 구성.
_SYSTEM_BLOCKS_BY_LANG = {
    lang: [
        {"type": "text", "text": cfg["system"], "cache_control": {"type": "ephemeral"}}
    ]
    for lang, cfg in _LANG.items()
}

# 하위호환 — 기존 import(`from ... import _SYSTEM_BLOCKS`) 가 가리키던 한국어 블록.
SYSTEM_PROMPT = _KO_SYSTEM
_SYSTEM_BLOCKS = _SYSTEM_BLOCKS_BY_LANG[DEFAULT_LANGUAGE]


def _build_user_prompt(topic: str, language: str) -> str:
    """언어·topic 유무에 따라 user 프롬프트를 만든다(호출마다 무작위 변형)."""
    cfg = _LANG[language]
    if topic:
        return cfg["topic"].format(topic=topic, angle=random.choice(cfg["angles"]))
    return cfg["general"].format(theme=random.choice(cfg["themes"]))


def generate_voice_script(
    topic: str | None = None, language: str = DEFAULT_LANGUAGE
) -> str:
    """음성 녹음용 학술 대본(~500자)을 ``language`` 로 생성해 평문으로 반환한다.

    ``topic`` 이 주어지면 그 강의 주제와 연관된 학술 산문을, 비어 있으면 일반
    학술문을 만든다. 호출마다 무작위 각도 + 높은 temperature 로 변형된 결과를 낸다.
    지원하지 않는 ``language`` 는 기본 언어(ko)로 폴백한다(엔드포인트 스키마가
    1차로 값을 검증하므로 방어적 폴백).

    Raises:
        VoiceScriptError: 외부 API 오류 또는 빈 응답.
    """
    lang = language if language in _LANG else DEFAULT_LANGUAGE
    topic_clean = (topic or "").strip()
    user_prompt = _build_user_prompt(topic_clean, lang)
    system_blocks = _SYSTEM_BLOCKS_BY_LANG[lang]

    # 명시적 timeout 30s — 슬라이드 스크립트 생성과 동일.
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)

    # 재시도는 _voice_script_call(@retry_external) 안에서 일어나도록, 여기서는
    # 재시도가 모두 소진된 뒤의 최종 오류만 사용자용 예외로 변환한다(재시도
    # 대상 예외를 데코레이트 함수 안에서 삼키면 백오프가 무력화되므로 분리).
    try:
        response = _voice_script_call(client, system_blocks, user_prompt)
    except anthropic.APIError as exc:
        logger.error("음성 녹음 대본 생성 실패: %s", exc)
        raise VoiceScriptError(f"대본 생성에 실패했습니다: {exc}") from exc

    _log_cost(response, topic=topic_clean or None, language=lang)

    if not response.content:
        raise VoiceScriptError("대본 생성에 실패했습니다: 빈 응답입니다.")
    text_block = next((b for b in response.content if b.type == "text"), None)
    if text_block is None or not (text_block.text or "").strip():
        raise VoiceScriptError("대본 생성에 실패했습니다: 텍스트가 비었습니다.")

    # 낭독 안전 평문으로 정리(마크다운 제거 + 한자 뒤 병음/주음 괄호 제거).
    return strip_pinyin_annotations(_strip_markdown(text_block.text))


@track_external_api("claude")
@retry_external(label="claude.voice_script", extra_retry_on=_RETRY_ON)
def _voice_script_call(client: anthropic.Anthropic, system_blocks: list, user_prompt: str):
    """Claude 단발 호출. 5xx/429/timeout 은 retry_external 가 백오프 재시도.

    재시도 가능 오류를 여기서 잡지 않고 그대로 올려, 데코레이터가 정책대로
    재시도하게 한다. 최종 실패는 호출자(generate_voice_script)가 변환한다.
    thinking 은 사용하지 않는다(짧은 대본 — 지연·비용만 늘 뿐).
    """
    return client.messages.create(
        model=settings.VOICE_SCRIPT_MODEL,
        max_tokens=settings.VOICE_SCRIPT_MAX_TOKENS,
        # 호출마다 결과 변형 — 녹음 대본은 매번 달라야 자연스러운 샘플이 된다.
        temperature=1.0,
        system=system_blocks,
        messages=[{"role": "user", "content": user_prompt}],
    )


def _log_cost(response, *, topic: str | None, language: str) -> None:
    """토큰 사용량·추정 비용을 구조화 로그로 계측(소액·1회성, best-effort)."""
    usage = getattr(response, "usage", None)
    if usage is None:
        return
    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    cost = (
        input_tokens * settings.CLAUDE_INPUT_COST_PER_M
        + output_tokens * settings.CLAUDE_OUTPUT_COST_PER_M
    ) / 1_000_000
    logger.info(
        "voice_script 비용: model=%s lang=%s input_tokens=%s output_tokens=%s "
        "cost=$%.6f topic=%s",
        settings.VOICE_SCRIPT_MODEL,
        language,
        input_tokens,
        output_tokens,
        cost,
        topic or "(none)",
    )
