"""본인 음성 녹음용 대본 생성 — Claude로 한국어 학술 산문(~500자)을 만든다.

교수자가 ElevenLabs Instant Voice Cloning(IVC) 용 샘플을 녹음할 때 읽을 대본을
생성한다. IVC 는 1분 내외의 자연스러운 발화 샘플이면 충분하므로, 낭독하기
좋은 한 편의 학술 산문(목록·표 없이 이어지는 단락)을 만든다.

모델 정책(config.py):
- "속도 최우선" — 기본은 경량 모델(Haiku, ``settings.SCRIPT_MODEL``)을 쓴다.
- Anthropic 계정의 동시 연결 한도가 낮아, 슬라이드 스크립트처럼 병렬화하지 않고
  **단발 호출**로 처리한다. 일시적 5xx/429/timeout 은 ``retry_external`` 백오프가
  흡수한다(슬라이드 생성과 동일 정책).

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


class VoiceScriptError(RuntimeError):
    """대본 생성 실패(외부 API 오류·빈 응답 등). 엔드포인트가 사용자에게 표면화."""


SYSTEM_PROMPT = """\
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

# 같은 system 텍스트라 prompt caching 으로 표시(반복 호출 시 cache_read 청구).
_SYSTEM_BLOCKS = [
    {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
]

# 호출마다 결과를 변형시키기 위한 서술 각도 힌트. topic 유무에 따라 다른 풀에서
# 무작위로 하나를 골라 user 프롬프트에 주입한다(temperature 와 함께 변형 강화).
_TOPIC_ANGLES = [
    "이 주제의 학문적 의의와 배경을 소개하는 도입부",
    "핵심 개념을 정의하고 그 중요성을 설명하는 단락",
    "이 주제를 공부할 때 유념할 관점이나 접근 방법",
    "구체적인 사례나 비유를 들어 풀어 주는 설명",
    "이 주제가 다른 분야와 맺는 연결과 확장 가능성",
    "학습자가 흥미를 갖도록 질문을 던지며 여는 서술",
]
_GENERAL_THEMES = [
    "학문을 대하는 태도와 탐구의 즐거움",
    "언어와 사고가 서로를 빚어 가는 방식",
    "배움이 한 사람의 시야를 넓히는 과정",
    "지식이 세대를 거쳐 축적되고 전승되는 일",
    "비판적으로 읽고 스스로 질문하는 습관",
    "서로 다른 학문이 만나 새로운 통찰을 낳는 순간",
]


def generate_voice_script(topic: str | None = None) -> str:
    """음성 녹음용 한국어 학술 대본(~500자)을 생성해 평문으로 반환한다.

    ``topic`` 이 주어지면 그 강의 주제와 연관된 학술 산문을, 비어 있으면 일반
    학술문을 만든다. 호출마다 무작위 각도 + 높은 temperature 로 변형된 결과를 낸다.

    Raises:
        VoiceScriptError: 외부 API 오류 또는 빈 응답.
    """
    topic_clean = (topic or "").strip()

    if topic_clean:
        angle = random.choice(_TOPIC_ANGLES)
        user_prompt = (
            f'강의 주제: "{topic_clean}"\n\n'
            f"위 주제와 연관된 한국어 학술 산문을 작성하세요. 이번에는 '{angle}'"
            " 형태로 써 주세요. 약 500자(450~550자)의 낭독용 대본 본문만 출력합니다."
        )
    else:
        theme = random.choice(_GENERAL_THEMES)
        user_prompt = (
            f"'{theme}'를 주제로 한국어 학술 산문을 작성하세요. 약 500자"
            "(450~550자)의 낭독용 대본 본문만 출력합니다."
        )

    # 명시적 timeout 30s — 슬라이드 스크립트 생성과 동일.
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)

    # 재시도는 _voice_script_call(@retry_external) 안에서 일어나도록, 여기서는
    # 재시도가 모두 소진된 뒤의 최종 오류만 사용자용 예외로 변환한다(재시도
    # 대상 예외를 데코레이트 함수 안에서 삼키면 백오프가 무력화되므로 분리).
    try:
        response = _voice_script_call(client, user_prompt)
    except anthropic.APIError as exc:
        logger.error("음성 녹음 대본 생성 실패: %s", exc)
        raise VoiceScriptError(f"대본 생성에 실패했습니다: {exc}") from exc

    _log_cost(response, topic=topic_clean or None)

    if not response.content:
        raise VoiceScriptError("대본 생성에 실패했습니다: 빈 응답입니다.")
    text_block = next((b for b in response.content if b.type == "text"), None)
    if text_block is None or not (text_block.text or "").strip():
        raise VoiceScriptError("대본 생성에 실패했습니다: 텍스트가 비었습니다.")

    # 낭독 안전 평문으로 정리(마크다운 제거 + 한자 뒤 병음 괄호 제거).
    return strip_pinyin_annotations(_strip_markdown(text_block.text))


@track_external_api("claude")
@retry_external(label="claude.voice_script", extra_retry_on=_RETRY_ON)
def _voice_script_call(client: anthropic.Anthropic, user_prompt: str):
    """Claude 단발 호출. 5xx/429/timeout 은 retry_external 가 백오프 재시도.

    재시도 가능 오류를 여기서 잡지 않고 그대로 올려, 데코레이터가 정책대로
    재시도하게 한다. 최종 실패는 호출자(generate_voice_script)가 변환한다.
    """
    return client.messages.create(
        model=settings.SCRIPT_MODEL,
        max_tokens=settings.SCRIPT_MAX_TOKENS,
        # 호출마다 결과 변형 — 녹음 대본은 매번 달라야 자연스러운 샘플이 된다.
        temperature=1.0,
        system=_SYSTEM_BLOCKS,
        messages=[{"role": "user", "content": user_prompt}],
    )


def _log_cost(response, *, topic: str | None) -> None:
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
        "voice_script 비용: model=%s input_tokens=%s output_tokens=%s "
        "cost=$%.6f topic=%s",
        settings.SCRIPT_MODEL,
        input_tokens,
        output_tokens,
        cost,
        topic or "(none)",
    )
