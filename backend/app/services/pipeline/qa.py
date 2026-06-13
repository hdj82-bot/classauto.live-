"""RAG 기반 Q&A 서비스."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import anthropic
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.services.pipeline.retriever import (
    SIMILARITY_THRESHOLD,
    RetrievalResult,
    search_similar_script,
    search_similar_slides,
)
from app.services.pipeline.translator import _lang_name

logger = logging.getLogger(__name__)

_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)


@track_external_api("claude")
@retry_external(label="claude.qa.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_qa_call(client, user_content: str, allow_refusal: bool = False):
    # allow_refusal=True(스크립트 유사도 < 0.4)일 때만 Claude 가 범위 밖을 거부할 수 있다.
    # 유사도 ≥ 0.4 면 관련성이 확정된 것으로 보고 반드시 답변하게 한다(교수자 결정).
    system = QA_SYSTEM_PROMPT_GATED if allow_refusal else QA_SYSTEM_PROMPT
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=2048, system=system,
        messages=[{"role": "user", "content": user_content}],
    )

OUT_OF_SCOPE_MESSAGE = (
    "죄송합니다. 해당 질문은 현재 강의 자료의 범위를 벗어납니다. "
    "강의 내용과 관련된 질문을 부탁드립니다."
)

# 범위 밖 판정 센티넬. Claude 가 강의 주제와 명백히 무관하다고 판단하면 이 토큰만
# 출력하도록 프롬프트로 지시하고, 응답에 이 토큰이 있으면 거부로 처리한다.
OUT_OF_SCOPE_SENTINEL = "[[OUT_OF_SCOPE]]"


# 채팅 말풍선(PlayerV2)·아바타 TTS 는 마크다운을 렌더링하지 않고 텍스트 그대로 표시·
# 발화한다. Claude 가 **굵게**·## 제목 같은 마크다운을 쓰면 기호(`**`, `#`)가 그대로
# 노출돼 거슬린다(교수자 요청 2026-06-12: 모든 채팅에서 `**` 가 보이지 않게). 프롬프트로
# 금지하되, 모델이 어겨도 안전하도록 생성 직후 기호를 제거한다(소스 단일 처리 → 플레이어·
# 캐시·인박스 등 모든 소비처가 한 번에 깨끗해진다).
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s*", re.MULTILINE)


def _strip_markdown(text: str) -> str:
    """답변에서 거슬리는 마크다운 서식 기호를 제거한다(내용은 보존).

    - ``**굵게**`` / ``__강조__`` → 내용만 남기고 기호 제거.
    - 줄머리 ``#`` ``##`` ``###`` 제목 표시 제거.
    `-` 목록·줄바꿈 등 텍스트로 자연스럽게 읽히는 구조는 그대로 둔다.
    """
    if not text:
        return text
    text = text.replace("**", "").replace("__", "")
    text = _HEADING_RE.sub("", text)
    return text.strip()

QA_SYSTEM_PROMPT = """\
당신은 이 강의의 전문가 조교입니다. 학습자의 질문에 전문가 수준으로 매우 자세하고
정확하게 답변하는 것이 목표입니다.

아래에 강의 스크립트(교수자가 강의에서 실제로 발화한 내용) 일부가 제공됩니다.
이는 이 강의의 주제를 보여주는 표본입니다(강의 전체가 아닐 수 있습니다).

답변 규칙:
1. 질문은 이미 이 강의의 주제와 관련 있다고 판정되어 전달됩니다. 따라서 제공된
   스크립트에 직접 나오지 않더라도 반드시 답변합니다. 제공된 강의 스크립트를 1차
   근거로 삼되, 강의 주제 범위 안에서 당신의 전문 지식으로 배경·예시·비교·심화까지
   깊이 있게 보충해 전문가 수준으로 설명합니다.
2. 강의 스크립트에 근거가 있으면 우선 활용하고 정확히 인용합니다. 자료를 넘어서는
   설명을 더할 때도 반드시 사실에 근거해 정확하게 합니다(불확실하면 단정하지 않습니다).
3. 한국어로 자연스럽고 체계적으로 답변합니다. 단, 마크다운 서식 기호를 쓰지 않습니다.
   별표(`**`, `*`)로 굵게/기울임 표시하거나 `#`·`##`·`###` 로 제목을 달지 마세요.
   구조가 필요하면 줄바꿈과 `-` 목록 정도만 사용해 일반 텍스트로 작성합니다.
4. 근거가 된 슬라이드 번호가 있으면 답변 끝에 표기합니다. (예: [슬라이드 3, 7])
"""

# 스크립트 유사도가 낮을 때(< 0.4)만 쓰는 변형 — 관련성이 약해 Claude 가 최종 판정한다.
# 강의 주제와 명백히 무관하면 거부(센티넬), 관련 있으면(표현만 달라 유사도가 낮은 경우 등)
# 전문가 수준으로 답변한다. 유사도 ≥ 0.4 경로는 위 QA_SYSTEM_PROMPT 로 항상 답변한다.
QA_SYSTEM_PROMPT_GATED = QA_SYSTEM_PROMPT + """
추가 판정 규칙(중요):
- 위 질문은 강의 스크립트와의 유사도가 낮게 측정되었습니다. 표현이 달라 유사도만 낮을
  뿐 강의 주제와 관련 있을 수 있으니, 관련 있다면 평소대로 전문가 수준으로 답변합니다.
- 다만 이 강의의 주제·분야와 명백히 무관하면(강의와 상관없는 잡담, 전혀 다른 분야 등),
  다른 어떤 텍스트도 출력하지 말고 정확히 다음 한 줄만 출력합니다: [[OUT_OF_SCOPE]]
"""


# 사전(seed) 답변 전용 시스템 프롬프트. 학생 Q&A(QA_SYSTEM_PROMPT)와 달리:
# - 아바타가 음성으로 읽으므로 "[슬라이드 3,7]" 같은 출처 표기를 넣지 않는다.
# - 중국어/한자 용어에 괄호 병기(예: 대학생(大学生))를 절대 넣지 않는다(교수자 요청).
# - 도입부가 매번 "좋은 질문이네요"로 시작해 AI 티가 나는 문제를 막기 위해, 상투적
#   도입부를 금지하고 자연스러운 시작을 다양화하도록 명시한다(교수자 요청).
def _seed_answer_system_prompt(lang_name: str) -> str:
    """사전 답변 생성 시스템 프롬프트. 답변 언어를 ``lang_name``(강의 발화 언어)으로
    강제한다 — 아바타 발화 내용과 같은 언어로 답해야 하기 때문(영어 강의면 영어).
    """
    return f"""\
당신은 강의 자료(PPT) 기반 Q&A 아바타의 답변 작성기입니다.
제공된 슬라이드 내용만을 근거로, 아바타가 학생에게 음성으로 전달할 답변을 작성하세요.

규칙:
1. 제공된 슬라이드 내용에 기반해 정확하게 답합니다. 슬라이드에 없는 내용은 추측하지 않습니다.
2. 답변은 반드시 {lang_name}(으)로 작성합니다(강의 발화 언어 = 아바타 발화 내용과 동일 언어).
   자연스럽게, 말하듯이 작성합니다(아바타가 음성으로 읽습니다).
3. 슬라이드 번호 등 출처 표기를 답변에 넣지 않습니다(음성으로 읽히면 어색함).
4. 중국어/한자 용어에 괄호로 음·뜻을 병기하지 않습니다.
   예: '대학생(大学生)'(X), '大学生(대학생)'(X) → '大学生'(O). 해당 용어만 그대로 씁니다.
5. 도입부를 다양하게, 자연스럽게 엽니다. 다음을 반드시 지키세요.
   - "좋은 질문이네요"(또는 해당 언어의 "Great question!" 류) 같은 상투적 칭찬 도입부를
     절대 쓰지 않습니다. 이런 정형화된 시작은 AI 답변처럼 들립니다.
   - 가능하면 핵심 내용부터 바로 들어가거나, 질문의 키워드를 자연스럽게 받아 시작합니다.
   - 매 답변이 똑같은 패턴으로 시작하지 않도록, 실제 교수자가 수업에서 말하듯
     변화를 줍니다.
"""


@track_external_api("claude")
@retry_external(label="claude.seed.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_seed_call(client, system: str, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=1024, system=system,
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


def generate_seed_answer(
    db: Session, task_id: str, question: str, lang: str = "ko"
) -> tuple[str, bool]:
    """교수자 사전 질문 1건에 대한 답변을 PPT(강의 자료) 기반으로 생성.

    답변은 ``lang``(강의 발화 언어 = lecture.voice_lang)으로 작성한다 — 아바타 발화
    내용과 같은 언어여야 하므로(영어 강의면 영어). 호출부가 voice_lang 을 넘긴다.

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

    "AI 답변 자동 생성" 버튼(즉시 검토)과 렌더 시 빈 답변 폴백이 공유한다. 답변 언어·
    중국어 괄호 병기 금지 등 표기 규칙은 _seed_answer_system_prompt 가 강제한다.
    """
    # 생성된 스크립트(발화 텍스트)를 우선 컨텍스트로 쓴다. 슬라이드 임베딩 검색을
    # 먼저 돌리던 과거 방식은 (1) 매 호출마다 OpenAI 임베딩(최대 20s) + pgvector
    # 왕복을 더해 Claude 호출과 합쳐 프록시/엣지 타임아웃을 넘겨 응답이 끊기는
    # ("서버에 연결할 수 없습니다") 원인이 됐고, (2) PPT 텍스트가 빈약해 어차피
    # 스크립트로 폴백되는 일이 잦았다. "질문과 답변 자동 생성"(batch)이 스크립트만
    # 쓰는 것과도 일치시키고, Q&A 는 스크립트만 근거로 한다는 정책(2026-06-12)에도
    # 맞다. 스크립트가 아직 없을 때만(생성 전) 슬라이드 임베딩으로 폴백한다.
    context = _script_context_for_task(db, task_id)
    if not context:
        results = search_similar_slides(db, task_id, question, top_k=3)
        context = _build_context(results) if results else ""
        if not context:
            return "", False

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    try:
        response = _claude_seed_call(
            client,
            _seed_answer_system_prompt(_lang_name(lang)),
            f"## 참고 슬라이드 내용\n{context}\n\n## 학생 질문\n{question}",
        )
    except anthropic.APIError as exc:
        logger.error("사전 답변 생성 Claude 호출 실패: %s", exc)
        return "", True

    if not response.content:
        logger.warning("사전 답변 생성: Claude 빈 응답")
        return "", True

    text_block = next((b for b in response.content if b.type == "text"), None)
    return _strip_markdown(text_block.text.strip() if text_block else ""), True


# ── 핵심 질문 + 사전 답변 자동 생성 ("질문과 답변 자동 생성" 버튼) ────────────────
# 교수자가 질문을 직접 적지 않아도, 강의 스크립트에서 학생이 자주 물을 핵심 질문 N개를
# AI 가 고르고 각 사전 답변까지 함께 만든다. 발화 언어(lecture.voice_lang)로 작성한다 —
# 영어 강의면 질문·답변도 영어. 교수자는 결과를 보고 그대로 두거나 수정한다.


def _seed_questions_system_prompt(lang_name: str) -> str:
    return f"""\
당신은 강의 자료를 바탕으로 학생이 가장 궁금해할 핵심 질문과 그 모범 사전 답변을 만드는 보조자입니다.
제공된 강의 스크립트(교수자 발화)를 분석해, 학생이 실제로 자주 물을 법한 핵심 질문과 각 질문의 답변을 만듭니다.

규칙:
1. 질문과 답변 모두 {lang_name}(으)로 작성합니다(강의 발화 언어).
2. 질문은 강의 핵심 개념을 짚는, 학생이 실제로 물을 만한 자연스러운 것이어야 합니다. 서로 다른 개념을 다루도록 겹치지 않게 고릅니다.
3. 답변은 아바타가 음성으로 읽습니다. 슬라이드 번호 등 출처 표기를 넣지 않고, 말하듯 자연스럽게 작성합니다.
4. 중국어/한자 용어에 괄호로 음·뜻을 병기하지 않습니다. 예: '大学生(대학생)'(X) → '大学生'(O).
5. "좋은 질문이네요" 같은 상투적 칭찬 도입부를 쓰지 않습니다. 핵심부터 자연스럽게 시작합니다.
6. 강의 자료에 근거해 정확히 답합니다. 자료에 없는 내용은 추측하지 않습니다.

출력은 아래 형식의 JSON 배열 하나만, 다른 텍스트 없이 출력합니다:
[{{"question": "질문", "answer": "사전 답변"}}, ...]
"""


@track_external_api("claude")
@retry_external(label="claude.seed_questions.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_seed_questions_call(client, system: str, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=2048, system=system,
        messages=[{"role": "user", "content": user_content}],
    )


def _parse_seed_questions_json(raw: str, n: int) -> list[dict]:
    """Claude 응답에서 첫 JSON 배열을 뽑아 [{question, answer}] 로 정규화(최대 n개)."""
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        arr = json.loads(match.group(0))
    except (json.JSONDecodeError, ValueError):
        return []
    out: list[dict] = []
    for item in arr if isinstance(arr, list) else []:
        if not isinstance(item, dict):
            continue
        q = _strip_markdown(str(item.get("question", "")).strip())
        a = _strip_markdown(str(item.get("answer", "")).strip())
        if q:
            out.append({"question": q, "answer": a})
        if len(out) >= n:
            break
    return out


def generate_seed_questions(
    db: Session, task_id: str, n: int = 3, lang: str = "ko"
) -> list[dict]:
    """강의 스크립트에서 핵심 질문 n개와 각 사전 답변을 ``lang`` 으로 생성.

    반환 ``[{"question": ..., "answer": ...}]`` (최대 n개). 스크립트가 없거나
    Claude 오류/파싱 실패면 빈 리스트(프론트는 빈 결과를 토스트로 안내).
    발화 언어(lecture.voice_lang)로 작성하므로 영어 강의는 질문·답변도 영어.
    """
    context = _script_context_for_task(db, task_id)
    if not context:
        return []

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0)
    try:
        response = _claude_seed_questions_call(
            client,
            _seed_questions_system_prompt(_lang_name(lang)),
            f"## 강의 스크립트\n{context}\n\n"
            f"위 강의에서 학생이 가장 궁금해할 핵심 질문 {n}개와 각 사전 답변을 "
            f"만들어 주세요. 정확히 {n}개의 항목을 JSON 배열로 출력하세요.",
        )
    except anthropic.APIError as exc:
        logger.error("사전 질문 자동 생성 Claude 호출 실패: %s", exc)
        return []

    if not response.content:
        return []
    text_block = next((b for b in response.content if b.type == "text"), None)
    return _parse_seed_questions_json(text_block.text if text_block else "", n)


@dataclass
class QAResult:
    answer: str
    in_scope: bool
    top_slides: list[RetrievalResult]
    input_tokens: int
    output_tokens: int
    cost_usd: float


def answer_question(db: Session, task_id: str, session_id: str, question: str) -> QAResult:
    """RAG 파이프라인 — **발화 스크립트만** 근거로 쓰고, 0.4 임계값으로 범위를 가른다.

    근거(컨텍스트)는 슬라이드 PPT 가 아니라 강의 스크립트(교수자가 실제 발화한 내용)만
    사용한다(교수자 결정 2026-06-12). 강의 슬라이드가 이미지 위주라 PPT 텍스트 추출이
    빈약해 PPT 기반 검색이 정상 강의 질문도 못 잡던 문제 때문 — 스크립트엔 실제 강의
    내용이 풍부히 들어 있다.

    범위 판정(교수자 결정 2026-06-12):
    - 스크립트 최고 유사도 ≥ 0.4 → 관련 확정. **반드시 답변**(거부 없음).
    - 스크립트 최고 유사도 < 0.4 → 표현만 달라 낮을 수 있으니 Claude 가 최종 판정
      (관련이면 답변, 명백히 무관할 때만 ``[[OUT_OF_SCOPE]]`` 거부).
    - 스크립트가 전혀 없음 → 판단 근거 없음. Claude 호출 없이 비용 0 으로 거부.
    """
    script_results = search_similar_script(db, task_id, question, top_k=3)
    context = _build_script_context(script_results)

    if not context:
        # 강의 스크립트가 없음 → 관련성 판단 불가. 비용 0 으로 거부.
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=script_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    best_sim = script_results[0].similarity if script_results else 0.0
    # ≥ 0.4: 관련 확정 → 항상 답변. < 0.4: Claude 가 관련성 최종 판정(거부 허용).
    allow_refusal = best_sim < SIMILARITY_THRESHOLD

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    try:
        response = _claude_qa_call(
            client,
            f"## 강의 스크립트(발화)\n{context}\n\n## 학습자 질문\n{question}",
            allow_refusal=allow_refusal,
        )
    except anthropic.APIError as exc:
        logger.error("Q&A Claude API 호출 실패: %s", exc)
        return QAResult(
            answer="죄송합니다. 일시적인 오류로 답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
            in_scope=True, top_slides=script_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    if not response.content:
        logger.warning("Q&A: Claude API가 빈 응답을 반환")
        return QAResult(
            answer="답변을 생성하지 못했습니다. 질문을 다시 작성해주세요.",
            in_scope=True, top_slides=script_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    text_block = next((b for b in response.content if b.type == "text"), None)
    answer = _strip_markdown((text_block.text if text_block else "").strip())

    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (input_tokens * settings.CLAUDE_INPUT_COST_PER_M + output_tokens * settings.CLAUDE_OUTPUT_COST_PER_M) / 1_000_000

    # < 0.4 경로에서만 Claude 가 거부할 수 있다(센티넬). 호출은 했으므로 비용은 기록.
    if allow_refusal and OUT_OF_SCOPE_SENTINEL in answer:
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=script_results,
            input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=round(cost, 6),
        )

    if not answer:
        answer = "답변을 생성하지 못했습니다. 질문을 다시 작성해주세요."

    return QAResult(
        answer=answer, in_scope=True, top_slides=script_results,
        input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=round(cost, 6),
    )


def _build_context(results: list[RetrievalResult]) -> str:
    parts = [f"### 슬라이드 {r.slide_number} (유사도: {r.similarity:.4f})\n{r.text_content}" for r in results]
    return "\n\n".join(parts)


def _build_script_context(script_results: list[RetrievalResult]) -> str:
    """강의 스크립트(발화) 검색 결과만으로 RAG 컨텍스트를 만든다.

    교수자 결정(2026-06-12)대로 답변 근거에 PPT 는 제외하고 발화 스크립트만 쓴다.
    """
    if not script_results:
        return ""
    return "\n\n".join(
        f"### 슬라이드 {r.slide_number} 발화 (유사도: {r.similarity:.4f})\n{r.text_content}"
        for r in script_results
    )
