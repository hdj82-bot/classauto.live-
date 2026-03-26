"""RAG 기반 Q&A 서비스 — 유사도 검색 + Claude 답변 생성."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.models.qa import QALog
from app.services.retriever import RetrievalResult, is_in_scope, search_similar_slides

logger = logging.getLogger(__name__)

# Claude Sonnet 4 pricing (per token)
INPUT_COST_PER_TOKEN = 3.0 / 1_000_000   # $3 / 1M input tokens
OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000  # $15 / 1M output tokens

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


@dataclass
class QAResult:
    answer: str
    in_scope: bool
    top_slides: list[RetrievalResult]
    input_tokens: int
    output_tokens: int
    cost_usd: float


def answer_question(
    db: Session,
    task_id: str,
    session_id: str,
    question: str,
) -> QAResult:
    """학습자 질문에 대해 RAG 파이프라인을 실행하고 결과를 DB에 저장한다."""

    # 1. 유사도 검색
    results = search_similar_slides(db, task_id, question, top_k=3)

    # 2. in_scope 판정
    scoped = is_in_scope(results)

    if not scoped:
        # out_of_scope → 안내 메시지만 반환
        qa_result = QAResult(
            answer=OUT_OF_SCOPE_MESSAGE,
            in_scope=False,
            top_slides=results,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
        )
        _save_log(db, session_id, task_id, question, qa_result)
        return qa_result

    # 3. in_scope → Claude API 답변 생성
    context = _build_context(results)
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=QA_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"## 참고 슬라이드 내용\n{context}\n\n## 학습자 질문\n{question}",
            }
        ],
    )

    answer = response.content[0].text
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = input_tokens * INPUT_COST_PER_TOKEN + output_tokens * OUTPUT_COST_PER_TOKEN

    qa_result = QAResult(
        answer=answer,
        in_scope=True,
        top_slides=results,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=round(cost, 6),
    )

    _save_log(db, session_id, task_id, question, qa_result)
    return qa_result


def _build_context(results: list[RetrievalResult]) -> str:
    """검색된 슬라이드 내용을 컨텍스트 문자열로 조합한다."""
    parts: list[str] = []
    for r in results:
        parts.append(
            f"### 슬라이드 {r.slide_number} (유사도: {r.similarity:.4f})\n{r.text_content}"
        )
    return "\n\n".join(parts)


def _save_log(
    db: Session,
    session_id: str,
    task_id: str,
    question: str,
    result: QAResult,
) -> None:
    """QALog 레코드를 저장한다."""
    log = QALog(
        session_id=session_id,
        task_id=task_id,
        question=question,
        answer=result.answer,
        in_scope=result.in_scope,
        top_slide_numbers=",".join(str(r.slide_number) for r in result.top_slides),
        top_similarity=result.top_slides[0].similarity if result.top_slides else None,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=result.cost_usd,
    )
    db.add(log)
    db.commit()
