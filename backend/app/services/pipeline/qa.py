"""RAG 기반 Q&A 서비스."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import anthropic
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.services.pipeline.retriever import RetrievalResult, is_in_scope, search_similar_slides

logger = logging.getLogger(__name__)

_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)


@track_external_api("claude")
@retry_external(label="claude.qa.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_qa_call(client, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=1024, system=QA_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

OUT_OF_SCOPE_MESSAGE = (
    "죄송합니다. 해당 질문은 현재 강의 자료의 범위를 벗어납니다. "
    "강의 내용과 관련된 질문을 부탁드립니다."
)

QA_SYSTEM_PROMPT = """\
당신은 강의 자료 기반 Q&A 도우미입니다.
아래 제공된 슬라이드 내용만을 근거로 학습자의 질문에 답변하세요.

규칙:
1. 제공된 슬라이드 내용에 기반하여 정확하게 답변합니다.
2. 슬라이드에 없는 내용은 추측하지 않습니다.
3. 한국어로 자연스럽게 답변합니다.
4. 참고한 슬라이드 번호를 답변 끝에 표기합니다. (예: [슬라이드 3, 7])
"""


# 사전(seed) 답변 전용 시스템 프롬프트. 학생 Q&A(QA_SYSTEM_PROMPT)와 달리:
# - 아바타가 음성으로 읽으므로 "[슬라이드 3,7]" 같은 출처 표기를 넣지 않는다.
# - 중국어/한자 용어에 괄호 병기(예: 대학생(大学生))를 절대 넣지 않는다(교수자 요청).
SEED_ANSWER_SYSTEM_PROMPT = """\
당신은 강의 자료(PPT) 기반 Q&A 아바타의 답변 작성기입니다.
제공된 슬라이드 내용만을 근거로, 아바타가 학생에게 음성으로 전달할 답변을 작성하세요.

규칙:
1. 제공된 슬라이드 내용에 기반해 정확하게 답합니다. 슬라이드에 없는 내용은 추측하지 않습니다.
2. 한국어로 자연스럽게, 말하듯이 작성합니다(아바타가 음성으로 읽습니다).
3. 슬라이드 번호 등 출처 표기를 답변에 넣지 않습니다(음성으로 읽히면 어색함).
4. 중국어/한자 용어에 괄호로 음·뜻을 병기하지 않습니다.
   예: '대학생(大学生)'(X), '大学生(대학생)'(X) → '大学生'(O). 해당 용어만 그대로 씁니다.
"""


@track_external_api("claude")
@retry_external(label="claude.seed.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_seed_call(client, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=1024, system=SEED_ANSWER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )


def generate_seed_answer(db: Session, task_id: str, question: str) -> tuple[str, bool]:
    """교수자 사전 질문 1건에 대한 답변을 PPT(강의 자료) 기반으로 생성.

    반환 ``(answer, in_scope)``:
    - 강의 슬라이드가 하나도 검색되지 않으면(임베딩 미생성 등) ``("", False)``.
    - 그 외에는 가장 가까운 슬라이드로 답변을 생성해 ``(생성된 답변, True)``.
      Claude 오류/빈 응답이면 ``("", True)``.

    ★ 학생 Q&A(answer_question)와 달리 ``is_in_scope`` 유사도 게이트(0.7)를 적용하지
    않는다. 사전 질문은 교수자가 직접 고른 본 강의 질문이라(신뢰된 저작), 0.7 게이트로는
    정상 질문도 자주 거부됐다(유사도 0.5~0.65). 학생용 범위 제한 가드레일은
    answer_question 에 그대로 유지된다.

    "AI 답변 자동 생성" 버튼(즉시 검토)과 렌더 시 빈 답변 폴백이 공유한다. 중국어
    괄호 병기 금지 등 표기 규칙은 SEED_ANSWER_SYSTEM_PROMPT 가 강제한다.
    """
    results = search_similar_slides(db, task_id, question, top_k=3)
    if not results:
        return "", False

    context = _build_context(results)
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    try:
        response = _claude_seed_call(
            client,
            f"## 참고 슬라이드 내용\n{context}\n\n## 학생 질문\n{question}",
        )
    except anthropic.APIError as exc:
        logger.error("사전 답변 생성 Claude 호출 실패: %s", exc)
        return "", True

    if not response.content:
        logger.warning("사전 답변 생성: Claude 빈 응답")
        return "", True

    text_block = next((b for b in response.content if b.type == "text"), None)
    return (text_block.text.strip() if text_block else ""), True


@dataclass
class QAResult:
    answer: str
    in_scope: bool
    top_slides: list[RetrievalResult]
    input_tokens: int
    output_tokens: int
    cost_usd: float


def answer_question(db: Session, task_id: str, session_id: str, question: str) -> QAResult:
    """RAG 파이프라인 실행."""
    results = search_similar_slides(db, task_id, question, top_k=3)
    scoped = is_in_scope(results)

    if not scoped:
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    context = _build_context(results)
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)

    try:
        response = _claude_qa_call(
            client,
            f"## 참고 슬라이드 내용\n{context}\n\n## 학습자 질문\n{question}",
        )
    except anthropic.APIError as exc:
        logger.error("Q&A Claude API 호출 실패: %s", exc)
        return QAResult(
            answer="죄송합니다. 일시적인 오류로 답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
            in_scope=True, top_slides=results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    if not response.content:
        logger.warning("Q&A: Claude API가 빈 응답을 반환")
        return QAResult(
            answer="답변을 생성하지 못했습니다. 질문을 다시 작성해주세요.",
            in_scope=True, top_slides=results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    text_block = next((b for b in response.content if b.type == "text"), None)
    answer = text_block.text if text_block else "답변을 생성하지 못했습니다."

    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (input_tokens * settings.CLAUDE_INPUT_COST_PER_M + output_tokens * settings.CLAUDE_OUTPUT_COST_PER_M) / 1_000_000

    return QAResult(
        answer=answer, in_scope=True, top_slides=results,
        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=round(cost, 6),
    )


def _build_context(results: list[RetrievalResult]) -> str:
    parts = [f"### 슬라이드 {r.slide_number} (유사도: {r.similarity:.4f})\n{r.text_content}" for r in results]
    return "\n\n".join(parts)
