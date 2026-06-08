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
# - 도입부가 매번 "좋은 질문이네요"로 시작해 AI 티가 나는 문제를 막기 위해, 상투적
#   도입부를 금지하고 자연스러운 시작을 다양화하도록 명시한다(교수자 요청).
SEED_ANSWER_SYSTEM_PROMPT = """\
당신은 강의 자료(PPT) 기반 Q&A 아바타의 답변 작성기입니다.
제공된 슬라이드 내용만을 근거로, 아바타가 학생에게 음성으로 전달할 답변을 작성하세요.

규칙:
1. 제공된 슬라이드 내용에 기반해 정확하게 답합니다. 슬라이드에 없는 내용은 추측하지 않습니다.
2. 한국어로 자연스럽게, 말하듯이 작성합니다(아바타가 음성으로 읽습니다).
3. 슬라이드 번호 등 출처 표기를 답변에 넣지 않습니다(음성으로 읽히면 어색함).
4. 중국어/한자 용어에 괄호로 음·뜻을 병기하지 않습니다.
   예: '대학생(大学生)'(X), '大学生(대학생)'(X) → '大学生'(O). 해당 용어만 그대로 씁니다.
5. 도입부를 다양하게, 자연스럽게 엽니다. 다음을 반드시 지키세요.
   - "좋은 질문이네요", "좋은 질문이에요", "좋은 질문입니다" 같은 상투적 칭찬 도입부를
     절대 쓰지 않습니다. 이런 정형화된 시작은 AI 답변처럼 들립니다.
   - 가능하면 핵심 내용부터 바로 들어가거나, 질문의 키워드를 자연스럽게 받아 시작합니다.
   - 매 답변이 똑같은 패턴으로 시작하지 않도록, 실제 교수자가 수업에서 말하듯
     변화를 줍니다. 예시(그대로 복사하지 말고 맥락에 맞게): "이 부분은 ~", "사실 ~",
     "정리하자면 ~", "핵심은 ~", "여기서 중요한 건 ~", "~를 먼저 짚어 보면", 또는
     도입 없이 곧바로 설명을 시작하기.
"""


@track_external_api("claude")
@retry_external(label="claude.seed.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_seed_call(client, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=1024, system=SEED_ANSWER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )


def _script_context_for_task(db: Session, task_id: str) -> str:
    """task_id 의 강의 → 생성된 스크립트(발화 텍스트)를 RAG 컨텍스트 문자열로 합친다.

    슬라이드 임베딩이 비었을 때의 폴백. VideoScript.segments([{slide_index, text}])의
    발화 텍스트를 슬라이드 순으로 이어 붙인다. 강의/영상/스크립트가 없으면 "".
    """
    from app.models.lecture import Lecture
    from app.models.video import Video

    lecture = (
        db.query(Lecture).filter(Lecture.pipeline_task_id == task_id).first()
    )
    if lecture is None:
        return ""
    video = db.query(Video).filter(Video.lecture_id == lecture.id).first()
    if video is None or video.script is None:
        return ""

    segments = video.script.segments or []
    parts: list[str] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        text_val = (seg.get("text") or "").strip()
        if not text_val:
            continue
        idx = seg.get("slide_index")
        label = f"### 슬라이드 {idx + 1}" if isinstance(idx, int) else "###"
        parts.append(f"{label}\n{text_val}")
    return "\n\n".join(parts).strip()


def generate_seed_answer(db: Session, task_id: str, question: str) -> tuple[str, bool]:
    """교수자 사전 질문 1건에 대한 답변을 PPT(강의 자료) 기반으로 생성.

    반환 ``(answer, in_scope)``:
    - 슬라이드 임베딩도 없고 생성된 스크립트도 없으면 ``("", False)``.
    - 그 외에는 강의 자료로 답변을 생성해 ``(생성된 답변, True)``.
      Claude 오류/빈 응답이면 ``("", True)``.

    강의 자료(컨텍스트) 우선순위:
    1) 슬라이드 임베딩 검색 결과(있으면 가장 가까운 슬라이드).
    2) 없으면 **생성된 스크립트(발화 텍스트) 전체** 로 폴백. 임베딩(step2)은 스크립트
       생성(step3)보다 먼저 돌아 스크립트가 RAG 에 안 들어가고, PPT 텍스트가 빈약하면
       검색이 비기 때문 — 교수자가 만든 스크립트가 사실상 강의 내용이므로 이를 쓴다.

    ★ 학생 Q&A(answer_question)와 달리 ``is_in_scope`` 유사도 게이트(0.7)를 적용하지
    않는다. 사전 질문은 교수자가 직접 고른 본 강의 질문이라(신뢰된 저작), 0.7 게이트로는
    정상 질문도 자주 거부됐다(유사도 0.5~0.65). 학생용 범위 제한 가드레일은
    answer_question 에 그대로 유지된다.

    "AI 답변 자동 생성" 버튼(즉시 검토)과 렌더 시 빈 답변 폴백이 공유한다. 중국어
    괄호 병기 금지 등 표기 규칙은 SEED_ANSWER_SYSTEM_PROMPT 가 강제한다.
    """
    results = search_similar_slides(db, task_id, question, top_k=3)
    if results:
        context = _build_context(results)
    else:
        # 슬라이드 임베딩이 비었다(PPT 텍스트 빈약/미생성) → 생성된 스크립트로 폴백.
        context = _script_context_for_task(db, task_id)
        if not context:
            return "", False

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
