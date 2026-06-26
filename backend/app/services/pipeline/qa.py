"""RAG 기반 Q&A 서비스."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

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

# ── 공개(익명) Q&A 강의별 일일 하드 캡 (C3-c, 폭주 2차 방어) ─────────────────────
# api/v1/qa.py 의 /qa/public 익명 경로는 세션·소유자 검증 없이 answer_question 을 부르며
# session_id 자리에 합성 키 "public" 을 넘긴다. 전역 RateLimitMiddleware 는 IP 당 분당만
# 막으므로, 익명 다수가 각자 한도 안에서 질문하면 강의 1개의 일일 Claude 호출 총량이
# 무한정 커진다. 그 총량을 강의(task_id)·UTC 일자 단위 하드 캡으로 막는다. 캡 초과 시
# RAG·Claude 호출 없이(비용 0) 안내 메시지를 반환한다.
PUBLIC_SESSION_ID = "public"
PUBLIC_QA_DAILY_CAP = 300  # 강의당 익명 Q&A 일일 최대 호출 수
PUBLIC_QA_CAP_MESSAGE = (
    "오늘 이 강의의 공개 질문 가능 횟수를 모두 사용했습니다. "
    "잠시 후 또는 내일 다시 시도하거나, 로그인 후 학습 세션에서 질문해 주세요."
)


def _public_qa_within_daily_cap(db: Session, task_id: str) -> bool:
    """공개 Q&A 의 강의별 일일 카운터를 증가시키고 캡 이내인지 반환한다.

    캡을 넘었으면 카운터를 올리지 않고 ``False``. 이내면 1 증가시키고 ``True``.
    공개 경로(api/v1/qa.public_question)는 세션 커밋을 하지 않으므로 카운터는 여기서
    직접 커밋한다 — 이 경로에는 다른 보류 중인 DB 쓰기가 없어 안전하다. 카운터 갱신
    중 어떤 오류도 답변을 막지 않도록(가용성 우선) 예외 시 통과(``True``)로 처리한다.
    """
    from app.models.embedding import PublicQADailyCount

    today = datetime.now(timezone.utc).date()
    try:
        row = (
            db.query(PublicQADailyCount)
            .filter(
                PublicQADailyCount.task_id == task_id,
                PublicQADailyCount.day == today,
            )
            .first()
        )
        if row is None:
            db.add(PublicQADailyCount(task_id=task_id, day=today, count=1))
            db.commit()
            return True
        if row.count >= PUBLIC_QA_DAILY_CAP:
            # 캡 초과 — 증가시키지 않고 즉시 차단(추가 비용 0).
            return False
        row.count += 1
        db.commit()
        return True
    except Exception:  # noqa: BLE001 — 카운터 장애가 정상 답변을 막지 않게 한다.
        db.rollback()
        logger.exception("공개 Q&A 일일 캡 카운터 갱신 실패(통과 처리): task_id=%s", task_id)
        return True

# 범위 밖 판정 센티넬. Claude 가 강의 주제와 명백히 무관하다고 판단하면 이 토큰만
# 출력하도록 프롬프트로 지시하고, 응답에 이 토큰이 있으면 거부로 처리한다.
OUT_OF_SCOPE_SENTINEL = "[[OUT_OF_SCOPE]]"

# H3: RAG 범위 가드 하드 플로어. < SIMILARITY_THRESHOLD(0.4) 경로의 거부를 Claude 의
# 센티넬 출력에만 맡기면, 크래프티드 질문(프롬프트 인젝션)이 센티넬을 억제해 강의 밖
# 질문에 일반지식으로 답해 버릴 수 있다(차별점 위반). 유사도가 이 하드 플로어 미만이면
# 강의와 명백히 무관한 것으로 보고 **Claude 호출 없이 결정적으로 거부**한다 — 인젝션
# 표면과 비용을 동시에 줄인다. 0.2~0.4 구간만 LLM 판정(센티넬)에 맡긴다.
RAG_HARD_FLOOR_SIMILARITY = 0.2


def _lecture_id_for_task(db: Session, task_id: str):
    """task_id(pipeline_task_id) → lecture_id. 없으면 None."""
    from app.models.lecture import Lecture

    return (
        db.query(Lecture.id)
        .filter(Lecture.pipeline_task_id == task_id)
        .scalar()
    )


def _record_qa_llm_cost(task_id: str, cost_usd: float) -> None:
    """학생/공개/미리보기 Q&A 의 Claude 비용을 platform_cost_logs(CostLog, category=llm_qa)에
    적재한다(별도 커밋 세션).

    종전엔 학생 Q&A 비용이 QALog.cost_usd 에만 들어가, 운영자 비용 대시보드·예산 집계
    (CostLog/RenderCostLog 합산, 스펙 13 §B)가 학생 Q&A LLM 지출을 **과소집계**했다(H1).
    호출부(answer_question)의 세션과 무관하게 독립 커밋한다 — 공개/미리보기 경로는 세션을
    커밋하지 않으므로 같은 세션에 적재하면 롤백돼 사라진다. 비용 0 은 기록하지 않고,
    어떤 실패도 답변 흐름을 막지 않는다(가용성 우선).
    """
    if not cost_usd or cost_usd <= 0:
        return
    from app.db.session import SyncSessionLocal
    from app.models.cost_log import CostCategory, CostLog

    sdb = SyncSessionLocal()
    try:
        lecture_id = _lecture_id_for_task(sdb, task_id)
        if lecture_id is None:
            return
        sdb.add(
            CostLog(
                lecture_id=lecture_id,
                category=CostCategory.llm_qa,
                model=settings.QA_MODEL,
                cost_usd=float(cost_usd),
                memo="qa_chat",
            )
        )
        sdb.commit()
    except Exception as exc:  # noqa: BLE001 — 비용 기록 실패가 답변을 막지 않게.
        sdb.rollback()
        logger.warning("Q&A LLM 비용 기록 실패(무시): task=%s err=%s", task_id, exc)
    finally:
        sdb.close()


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
6. 답변 길이는 약 200~400자(영어는 ~35~80 단어)로 간결하게 작성합니다. 핵심만
   담아 한두 단락으로 마무리하고, 어떤 언어로 쓰든 400자를 넘기지 않습니다(아바타 발화가
   길어지면 학습자 집중이 떨어지고 렌더 비용도 커짐).
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


def _seed_questions_system_prompt(lang_name: str, n: int) -> str:
    return f"""\
당신은 강의 발화 스크립트(교수자가 강의에서 실제로 말한 내용 전체)를 바탕으로, 이 강의에서 가장
중요한 핵심 {n}가지를 짚는 질문과 그 모범 사전 답변을 만드는 보조자입니다. 제공된 스크립트 전체를
먼저 통독해 이 강의가 다루는 주제들을 파악한 뒤, 그중 가장 중요한 {n}개를 골라 질문으로 만드세요.

가장 중요한 원칙 — {n}개의 질문은 반드시 서로 다른 핵심을 짚어야 합니다:
- 강의에서 가장 중요한 서로 다른 주제·개념을 {n}개 골라(가능하면 강의 앞·중간·뒤에 고루 분포), 각
  질문이 그중 하나씩만 다루게 합니다.
- {n}개 질문이 중복되거나 비슷해서는 절대 안 됩니다. 같은 주제를 표현만 바꾼 변형도 금지합니다.
  예: "어순이 어떻게 다른가요?"와 "SVO·SOV 구조가 구체적으로 어떻게 다른가요?"는 사실상 같은
  질문이므로 둘 다 넣지 마세요. 하나를 빼고 강의의 다른 핵심을 질문으로 만드세요.
- 한 개념에 몰린 비슷한 질문 여러 개보다, 서로 다른 핵심을 폭넓게 짚는 편이 학생에게 훨씬 유용합니다.

규칙:
1. 질문과 답변 모두 {lang_name}(으)로 작성합니다. 발화 스크립트의 언어와 질문·답변의 언어는 항상
   같아야 합니다(강의 발화 언어 = {lang_name}). 다른 언어를 섞지 마세요.
2. 질문은 학생이 실제로 물을 만한 자연스러운 것이어야 합니다.
3. 답변은 아바타가 음성으로 읽습니다. 슬라이드 번호 등 출처 표기를 넣지 않고, 말하듯 자연스럽게 작성합니다.
4. 중국어/한자 용어에 괄호로 음·뜻을 병기하지 않습니다. 예: '大学生(대학생)'(X) → '大学生'(O).
5. "좋은 질문이네요" 같은 상투적 칭찬 도입부를 쓰지 않습니다. 핵심부터 자연스럽게 시작합니다.
6. 발화 스크립트에 근거해 정확히 답합니다. 스크립트에 없는 내용은 추측하지 않습니다.
7. 각 답변은 약 200~400자(영어는 ~35~80 단어)로 간결하게, 어떤 언어로 쓰든 400자를 넘기지
   않습니다(아바타 발화가 길어지면 학습자 집중이 떨어지고 렌더 비용도 커짐).

출력은 아래 형식의 JSON 배열 하나만, 다른 텍스트 없이 출력합니다(질문은 서로 겹치지 않는 다른 핵심이어야 함):
[{{"question": "질문", "answer": "사전 답변"}}, ...]
"""


@track_external_api("claude")
@retry_external(label="claude.seed_questions.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_seed_questions_call(client, system: str, user_content: str):
    return client.messages.create(
        model=settings.QA_MODEL, max_tokens=2048, system=system,
        messages=[{"role": "user", "content": user_content}],
    )


def _normalize_question_key(q: str) -> str:
    """중복 판정용 정규화 — 공백·문장부호를 모두 제거하고 소문자화한다.

    한글·한자 등 글자(\\w)는 보존하고 공백/물음표/쉼표 같은 기호만 떼어내, '어순이
    다른가요?' 와 '어순이 다른가요' 처럼 표기만 다른 같은 질문을 한 번만 채택한다.
    의미는 같지만 표현이 다른 변형(패러프레이즈)까지 잡진 못하며, 그건 프롬프트의
    '서로 다른 개념' 지시로 막는다.
    """
    return re.sub(r"[\s\W_]+", "", q).lower()


def _parse_seed_questions_json(raw: str, n: int) -> list[dict]:
    """Claude 응답에서 첫 JSON 배열을 뽑아 [{question, answer}] 로 정규화(최대 n개).

    동일·표기만 다른 중복 질문은 제거한다 — 모델이 같은 질문을 N번 내놓아도 카드 N장이
    같은 내용으로 채워지지 않게(교수자 요청 2026-06-16).
    """
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        arr = json.loads(match.group(0))
    except (json.JSONDecodeError, ValueError):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for item in arr if isinstance(arr, list) else []:
        if not isinstance(item, dict):
            continue
        q = _strip_markdown(str(item.get("question", "")).strip())
        a = _strip_markdown(str(item.get("answer", "")).strip())
        if not q:
            continue
        key = _normalize_question_key(q)
        if key in seen:
            continue  # 동일·표기만 다른 중복 질문 → 건너뜀.
        seen.add(key)
        out.append({"question": q, "answer": a})
        if len(out) >= n:
            break
    return out


def generate_seed_questions(
    db: Session, task_id: str, n: int = 3, lang: str = "ko",
    exclude: list[str] | None = None,
) -> list[dict]:
    """강의 발화 스크립트에서 가장 중요한 핵심 질문 n개와 각 사전 답변을 ``lang`` 으로 생성.

    Claude 가 발화 스크립트 전체를 보고 이 강의에서 가장 중요한 n개의 핵심을 골라, 서로
    겹치지 않는 질문 n개와 답변을 만든다(교수자 요청 2026-06-16: 자동 생성된 질문 3개가 모두
    같은 주제로 중복되던 문제). 근거는 PPT 가 아니라 발화 스크립트만 쓴다 — 학생 Q&A
    (answer_question)·사전 답변과 동일한 정책(2026-06-12). 질문·답변 언어는 발화 언어(lang)와
    항상 같다. 동일·표기만 다른 중복은 파싱 단계에서 한 번 더 제거하므로, 결과가 n개보다
    적을 수 있다(중복 대신 서로 다른 질문만 남긴다).

    ``exclude``: 이미 다른 카드에 들어 있는 질문들. 프론트는 카드별로 1개씩 생성하는데
    (page.tsx handleAutoGenerateSeedQuestion), 매 호출이 독립적이라 모델이 "가장 중요한
    핵심"(예: 어순)을 매번 #1 로 다시 뽑아, 표현만 다른 같은 주제가 3카드에 반복되던 문제를
    막는다. 이 목록의 주제·내용과 명백히 다른(겹치지 않는) 질문을 만들도록 프롬프트에 싣는다.

    반환 ``[{"question": ..., "answer": ...}]`` (최대 n개). 스크립트가 없거나
    Claude 오류/파싱 실패면 빈 리스트(프론트는 빈 결과를 토스트로 안내).
    발화 언어(lecture.voice_lang)로 작성하므로 영어 강의는 질문·답변도 영어.
    """
    # 발화 스크립트 전체(슬라이드 순)를 컨텍스트로 준다 — Claude 가 강의 전체를 보고 가장
    # 중요한 핵심 n개를 서로 다른 주제로 고른다. PPT 는 쓰지 않는다(2026-06-12 정책).
    context = _script_context_for_task(db, task_id)
    if not context:
        # 발화 스크립트가 없으면(파이프라인 미완 등) 생성 불가.
        return []

    # 이미 만든 질문(다른 카드)들 — 이 주제들을 피해 강의의 또 다른 핵심을 뽑게 한다.
    exclude_clean = [q.strip() for q in (exclude or []) if q and q.strip()]
    exclude_block = ""
    if exclude_clean:
        listed = "\n".join(f"- {q}" for q in exclude_clean)
        exclude_block = (
            "\n\n## 이미 만든 질문 (반드시 피하기)\n"
            f"{listed}\n"
            "위 질문들과 같은 주제·핵심을 다루거나 표현만 바꾼 질문은 절대 만들지 마세요. "
            "위 목록과 분명히 다른, 강의의 또 다른 핵심을 짚는 질문을 만드세요."
        )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0)
    try:
        response = _claude_seed_questions_call(
            client,
            _seed_questions_system_prompt(_lang_name(lang), n),
            f"## 강의 발화 스크립트 (전체)\n{context}{exclude_block}\n\n"
            f"위 발화 스크립트 전체를 읽고, 이 강의에서 가장 중요한 핵심 {n}가지를 골라 학생이 "
            f"물을 만한 질문 {n}개와 각 사전 답변을 만들어 주세요. {n}개 질문은 반드시 서로 다른 "
            f"핵심을 짚어야 하며, 중복되거나 비슷해서는 안 됩니다. 정확히 {n}개의 항목을 JSON "
            f"배열로 출력하세요.",
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

    공개(익명) 경로(session_id="public")는 강의별 일일 하드 캡(C3-c)을 먼저 검사한다.
    캡 초과면 RAG·Claude 없이 안내 메시지를 비용 0 으로 반환해 폭주를 2차로 막는다.
    """
    if session_id == PUBLIC_SESSION_ID and not _public_qa_within_daily_cap(db, task_id):
        logger.warning("공개 Q&A 일일 캡 초과 — 차단: task_id=%s", task_id)
        return QAResult(
            answer=PUBLIC_QA_CAP_MESSAGE, in_scope=False, top_slides=[],
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    script_results = search_similar_script(db, task_id, question, top_k=3)
    context = _build_script_context(script_results)

    if not context:
        # 강의 스크립트가 없음 → 관련성 판단 불가. 비용 0 으로 거부.
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=script_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    best_sim = script_results[0].similarity if script_results else 0.0

    # H3: 하드 플로어 미만이면 강의와 명백히 무관 → Claude 호출 없이 결정적 거부(비용 0).
    # < 0.4 거부를 LLM 센티넬에만 맡길 때의 프롬프트 인젝션 우회를 이 구간에서 차단한다.
    if best_sim < RAG_HARD_FLOOR_SIMILARITY:
        logger.info(
            "Q&A 하드 플로어 미만 — 결정적 거부(Claude 미호출): sim=%.4f task=%s",
            best_sim, task_id,
        )
        return QAResult(
            answer=OUT_OF_SCOPE_MESSAGE, in_scope=False, top_slides=script_results,
            input_tokens=0, output_tokens=0, cost_usd=0.0,
        )

    # ≥ 0.4: 관련 확정 → 항상 답변. [0.2, 0.4): Claude 가 관련성 최종 판정(거부 허용).
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

    # H1: 학생/공개/미리보기 Q&A 의 Claude 비용을 CostLog(llm_qa)에도 적재(운영자 비용
    # 대시보드·예산 집계 포함). QALog.cost_usd 는 학생 분석용으로 그대로 유지(별도 테이블).
    _record_qa_llm_cost(task_id, cost)

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
