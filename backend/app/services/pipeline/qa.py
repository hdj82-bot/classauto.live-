"""RAG 기반 Q&A 서비스."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import anthropic
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.services.pipeline.retriever import (
    RetrievalResult,
    search_similar_script,
    search_similar_slides,
)

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
        model=settings.QA_MODEL, max_tokens=2048, system=QA_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

OUT_OF_SCOPE_MESSAGE = (
    "죄송합니다. 해당 질문은 현재 강의 자료의 범위를 벗어납니다. "
    "강의 내용과 관련된 질문을 부탁드립니다."
)

# 범위 밖 판정 센티넬. Claude 가 강의 주제와 명백히 무관하다고 판단하면 이 토큰만
# 출력하도록 프롬프트로 지시하고, 응답에 이 토큰이 있으면 거부로 처리한다.
OUT_OF_SCOPE_SENTINEL = "[[OUT_OF_SCOPE]]"

QA_SYSTEM_PROMPT = """\
당신은 이 강의의 전문가 조교입니다. 학습자의 질문에 전문가 수준으로 매우 자세하고
정확하게 답변하는 것이 목표입니다.

아래에 강의 자료 일부(슬라이드 PPT + 강의 스크립트(교수자 발화))가 제공됩니다.
이는 이 강의의 주제를 보여주는 표본입니다(강의 전체가 아닐 수 있습니다).

판단과 답변 규칙:
1. 질문이 이 강의의 주제·분야와 관련 있으면, 제공된 자료에 직접 나오지 않더라도
   답변합니다. 제공된 강의 자료를 1차 근거로 삼되, 강의 주제 범위 안에서 당신의
   전문 지식으로 배경·예시·비교·심화까지 깊이 있게 보충해 전문가 수준으로 설명합니다.
2. 강의 자료에 근거가 있으면 우선 활용하고 정확히 인용합니다. 자료를 넘어서는 설명을
   더할 때도 반드시 사실에 근거해 정확하게 합니다(불확실하면 단정하지 않습니다).
3. 질문이 이 강의의 주제와 명백히 무관하면(강의와 상관없는 잡담, 전혀 다른 분야 등),
   다른 어떤 텍스트도 출력하지 말고 정확히 다음 한 줄만 출력합니다: [[OUT_OF_SCOPE]]
4. 한국어로 자연스럽고 체계적으로(필요하면 소제목·목록으로 구조화해) 답변합니다.
5. 근거가 된 슬라이드 번호가 있으면 답변 끝에 표기합니다. (예: [슬라이드 3, 7])
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
    """RAG 파이프라인 — 범위 판정은 Claude 가 한다(임베딩은 검색·컨텍스트 구성용).

    강의 자료(슬라이드 PPT + 스크립트(발화))를 1차 근거로 제공하고, 질문이 강의 주제와
    관련 있으면 자료에 직접 없더라도 Claude 가 전문 지식으로 보충해 전문가 수준으로 자세히
    답한다(교수자 결정 2026-06-11). 강의 주제와 **명백히 무관**할 때만 Claude 가
    ``[[OUT_OF_SCOPE]]`` 를 출력하고, 이 경우에만 범위 밖으로 거부한다.

    종전의 임베딩 유사도 하드 게이트(0.4)는 제거했다 — PPT 불릿/스크립트에 단어가 없다는
    이유로 정상 강의 질문이 거부되던 문제 때문(교수자 반복 보고). 강의 자료 자체가 전혀
    없으면(슬라이드·스크립트 모두 없음) 판단 근거가 없으므로 Claude 호출 없이 거부한다.
    """
    slide_results = search_similar_slides(db, task_id, question, top_k=3)
    script_results = search_similar_script(db, task_id, question, top_k=3)
    context = _build_combined_context(slide_results, script_results)

    if not context:
        # 강의 자료가 전혀 없음 → 관련성 판단 불가. 비용 0 으로 거부.
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=slide_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    try:
        response = _claude_qa_call(
            client,
            f"## 강의 자료(표본)\n{context}\n\n## 학습자 질문\n{question}",
        )
    except anthropic.APIError as exc:
        logger.error("Q&A Claude API 호출 실패: %s", exc)
        return QAResult(
            answer="죄송합니다. 일시적인 오류로 답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
            in_scope=True, top_slides=slide_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    if not response.content:
        logger.warning("Q&A: Claude API가 빈 응답을 반환")
        return QAResult(
            answer="답변을 생성하지 못했습니다. 질문을 다시 작성해주세요.",
            in_scope=True, top_slides=slide_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    text_block = next((b for b in response.content if b.type == "text"), None)
    answer = (text_block.text if text_block else "").strip()

    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (input_tokens * settings.CLAUDE_INPUT_COST_PER_M + output_tokens * settings.CLAUDE_OUTPUT_COST_PER_M) / 1_000_000

    # Claude 가 강의 주제와 무관하다고 판정 → 거부(센티넬). 호출은 했으므로 비용은 기록.
    if OUT_OF_SCOPE_SENTINEL in answer:
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=slide_results,
            input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=round(cost, 6),
        )

    if not answer:
        answer = "답변을 생성하지 못했습니다. 질문을 다시 작성해주세요."

    return QAResult(
        answer=answer, in_scope=True, top_slides=slide_results,
        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=round(cost, 6),
    )


def _build_context(results: list[RetrievalResult]) -> str:
    parts = [f"### 슬라이드 {r.slide_number} (유사도: {r.similarity:.4f})\n{r.text_content}" for r in results]
    return "\n\n".join(parts)


def _build_combined_context(
    slide_results: list[RetrievalResult],
    script_results: list[RetrievalResult],
) -> str:
    """슬라이드(PPT)와 강의 스크립트(발화) 검색 결과를 하나의 RAG 컨텍스트로 합친다.

    교수자 요청대로 답변 근거에 PPT 텍스트와 발화 스크립트를 모두 포함한다.
    """
    parts: list[str] = []
    if slide_results:
        parts.append("## 슬라이드(PPT)\n" + _build_context(slide_results))
    if script_results:
        seg = "\n\n".join(
            f"### 슬라이드 {r.slide_number} 발화 (유사도: {r.similarity:.4f})\n{r.text_content}"
            for r in script_results
        )
        parts.append("## 강의 스크립트(발화)\n" + seg)
    return "\n\n".join(parts)
