"""소크라테스식 인터랙티브 퀴즈 저작 서비스.

기존 일괄 자동 생성(services/question.py)과 달리, 교수자가 클로드(소크라테스 역할)와
다중 턴 대화로 한 슬라이드 경계에 들어갈 퀴즈 1문항을 다듬어 확정한다.

- Claude 호출 패턴은 services/pipeline/qa.py 를 그대로 따른다(@track_external_api +
  @retry_external + usage 기반 비용 계산).
- DB 접근은 동기 Session(qa.answer_question 과 동일) — API 라우터가
  run_in_executor 로 호출해 이벤트 루프를 막지 않는다.
- 난이도: 상=hard / 중=medium / 하=easy.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.models.cost_log import CostCategory, CostLog
from app.models.embedding import SlideEmbedding
from app.models.lecture import Lecture
from app.models.question import AssessmentType, Difficulty, Question, QuestionType
from app.models.video import Video

logger = logging.getLogger(__name__)

_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)

_DIFFICULTY_KO = {"easy": "하(쉬움)", "medium": "중(보통)", "hard": "상(어려움)"}
_QTYPE_KO = {"multiple_choice": "객관식(4지선다)", "short_answer": "주관식(서술형)"}


@track_external_api("claude")
@retry_external(label="claude.quiz.socratic", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_socratic_call(client: anthropic.Anthropic, system: str, messages: list[dict]):
    return client.messages.create(
        model=settings.SOCRATIC_MODEL,
        max_tokens=settings.SOCRATIC_MAX_TOKENS,
        system=system,
        messages=messages,
    )


@dataclass
class SocraticResult:
    reply: str
    draft: dict | None
    done: bool
    input_tokens: int
    output_tokens: int
    cost_usd: float


# ── 프롬프트 ──────────────────────────────────────────────────────────────────

def _build_system_prompt(slide_context: str, n: int, question_type: str, difficulty: str) -> str:
    qtype_ko = _QTYPE_KO.get(question_type, _QTYPE_KO["multiple_choice"])
    diff_ko = _DIFFICULTY_KO.get(difficulty, _DIFFICULTY_KO["medium"])
    return f"""당신은 대학 교수자와 함께 강의 영상에 삽입할 평가 문제를 설계하는 교육과정 설계 파트너입니다. 소크라테스식 대화법으로 교수자의 의도를 이끌어내어 최종 문제를 확정합니다.

## 출제 맥락
- 삽입 위치: 슬라이드 {n + 1}번과 {n + 2}번 사이 (학생이 영상에서 이 지점에 도달하면 출제)
- 문제 유형: {qtype_ko}
- 난이도: {diff_ko}
- 문항 수: 정확히 1문항

## 근거 자료 (반드시 이 범위 안에서만 출제)
{slide_context}

## 대화 방식
1. 첫 응답: 위 슬라이드 내용을 분석해 문제 **초안 1개**와 **출제 근거**(왜 이 개념·이 형태로 묻는지)를 제시합니다.
2. 이어서 교수자에게 **유도 질문 1~2개**를 던집니다. 예: 이 구간에서 학생이 가장 흔히 틀리는 지점은 무엇인가요? 오답 보기는 어떤 오개념을 노리면 좋을까요? 측정하려는 핵심 학습 목표는 무엇인가요?
3. 교수자의 답변을 반영해 초안을 다듬고, 필요하면 한 번 더 되묻습니다.
4. 교수자가 만족(확정·좋다·이대로 등)을 표하면 done 을 true 로 둡니다.

## 응답 형식 (매 턴 반드시 지킬 것)
먼저 교수자에게 보일 자연어 메시지를 작성하고, 그 **뒤에** 아래 형식의 JSON 코드블록을 하나만 덧붙입니다:

```json
{{"draft": {{"question_type": "{question_type}", "difficulty": "{difficulty}", "content": "문제 본문", "options": ["선택지A","선택지B","선택지C","선택지D"], "correct_answer": "정답", "explanation": "정답 해설"}}, "done": false}}
```

규칙:
- 객관식이면 options 는 정확히 4개, correct_answer 는 정답 선택지의 인덱스 문자열("0"~"3").
- 주관식이면 options 는 null, correct_answer 는 핵심 키워드를 담은 모범답안.
- 아직 초안을 제시하기 이르면 draft 를 null 로 두어도 됩니다.
- 자연어 메시지에는 코드블록이나 JSON 을 노출하지 말고, 사람에게 말하듯 자연스럽게 작성하세요.
- 항상 한국어로 대화합니다.
"""


# ── 슬라이드 컨텍스트 ─────────────────────────────────────────────────────────

def _slide_context(db: Session, lecture_id: uuid.UUID, n: int) -> str:
    """슬라이드 N-1, N, N+1(0-based) 텍스트를 모아 반환. VideoScript 우선, SlideEmbedding 폴백."""
    wanted = [i for i in (n - 1, n, n + 1) if i >= 0]
    parts: dict[int, str] = {}

    video = (
        db.execute(
            select(Video)
            .where(Video.lecture_id == lecture_id)
            .order_by(Video.created_at.desc())
        )
        .scalars()
        .first()
    )
    if video and video.script and video.script.segments:
        for seg in video.script.segments:
            idx = seg.get("slide_index")
            if idx in wanted and seg.get("text"):
                parts[idx] = seg["text"]

    missing = [i for i in wanted if i not in parts]
    if missing:
        lecture = db.get(Lecture, lecture_id)
        task_id = lecture.pipeline_task_id if lecture else None
        if task_id:
            rows = (
                db.execute(
                    select(SlideEmbedding).where(
                        SlideEmbedding.task_id == task_id,
                        SlideEmbedding.slide_number.in_([i + 1 for i in missing]),
                    )
                )
                .scalars()
                .all()
            )
            for row in rows:
                parts[row.slide_number - 1] = row.text_content

    if not parts:
        return "(슬라이드 텍스트를 찾을 수 없습니다. 강의 일반 원칙에 따라 설계하되, 추측을 최소화하세요.)"

    return "\n\n".join(f"### 슬라이드 {idx + 1}\n{parts[idx]}" for idx in sorted(parts))


# ── 응답 파싱 ─────────────────────────────────────────────────────────────────

def _normalize_draft(d: dict) -> dict | None:
    content = str(d.get("content", "")).strip()
    if not content:
        return None
    qtype = d.get("question_type")
    if qtype not in ("multiple_choice", "short_answer"):
        qtype = "multiple_choice"
    diff = d.get("difficulty")
    if diff not in ("easy", "medium", "hard"):
        diff = "medium"
    options = d.get("options")
    if qtype == "short_answer":
        options = None
    elif not isinstance(options, list):
        options = None
    ca = d.get("correct_answer")
    return {
        "question_type": qtype,
        "difficulty": diff,
        "content": content,
        "options": options,
        "correct_answer": (str(ca).strip() if ca is not None else None),
        "explanation": d.get("explanation"),
    }


def _split_reply(raw: str) -> tuple[str, dict | None, bool]:
    """자연어 메시지와 JSON 코드블록(draft/done)을 분리."""
    draft: dict | None = None
    done = False
    reply = raw.strip()

    block = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
    if block:
        reply = (raw[: block.start()] + raw[block.end():]).strip()
        try:
            data = json.loads(block.group(1))
            if isinstance(data, dict):
                done = bool(data.get("done", False))
                d = data.get("draft")
                if isinstance(d, dict):
                    draft = _normalize_draft(d)
        except json.JSONDecodeError:
            logger.warning("소크라테스 응답 JSON 파싱 실패 — draft 없이 진행")

    if not reply:
        reply = "초안을 정리했습니다. 아래 미리보기를 확인해 주세요."
    return reply, draft, done


# ── 대화 ──────────────────────────────────────────────────────────────────────

def socratic_turn(
    db: Session,
    lecture_id: uuid.UUID,
    insert_after_slide_index: int,
    question_type: str,
    difficulty: str,
    messages: list[dict],
) -> SocraticResult:
    """대화 1턴 실행. messages 가 비어 있으면 클로드가 먼저 초안을 제시한다."""
    context = _slide_context(db, lecture_id, insert_after_slide_index)
    system = _build_system_prompt(context, insert_after_slide_index, question_type, difficulty)

    # 숨은 kickoff(user) 를 항상 맨 앞에 붙인다. 프론트는 화면에 보이는 턴만 보관하므로
    # 그 히스토리는 항상 assistant 응답으로 시작한다 → 여기에 user kickoff 를 선행시키면
    # [user, assistant, user, ...] 의 올바른 교대·user 시작 규칙을 만족한다.
    convo: list[dict] = [
        {
            "role": "user",
            "content": "이 구간에 넣을 문제 초안과 출제 근거를 제시하고, 확정을 위해 제게 필요한 점을 물어봐 주세요.",
        }
    ] + list(messages)

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0)
    try:
        response = _claude_socratic_call(client, system, convo)
    except anthropic.APIError as exc:
        logger.error("소크라테스 대화 Claude 호출 실패: %s", exc)
        raise RuntimeError(f"대화 생성 실패: {exc}") from exc

    raw = next((b.text for b in response.content if b.type == "text"), "")
    reply, draft, done = _split_reply(raw)

    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (
        input_tokens * settings.CLAUDE_INPUT_COST_PER_M
        + output_tokens * settings.CLAUDE_OUTPUT_COST_PER_M
    ) / 1_000_000

    # 비용 서버 기록 (best-effort — 실패해도 대화는 계속). 교수자 UI 에는 노출하지 않음.
    try:
        db.add(
            CostLog(
                lecture_id=lecture_id,
                category=CostCategory.llm_assessment,
                model=settings.SOCRATIC_MODEL,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=round(cost, 6),
                memo="quiz socratic dialogue",
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("CostLog 기록 실패(무시): %s", exc)
        db.rollback()

    return SocraticResult(
        reply=reply,
        draft=draft,
        done=done,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=round(cost, 6),
    )


# ── 확정/저장 ─────────────────────────────────────────────────────────────────

def _boundary_timestamp(db: Session, lecture_id: uuid.UUID, n: int) -> int | None:
    """슬라이드 N(0-based)의 끝나는 시점(초)을 VideoScript 세그먼트에서 파생. 없으면 None."""
    video = (
        db.execute(
            select(Video)
            .where(Video.lecture_id == lecture_id)
            .order_by(Video.created_at.desc())
        )
        .scalars()
        .first()
    )
    if not video or not video.script or not video.script.segments:
        return None
    for seg in video.script.segments:
        if seg.get("slide_index") == n:
            end = seg.get("end_seconds")
            if isinstance(end, (int, float)) and end >= 0:
                return int(end)
    return None


def confirm_quiz(
    db: Session,
    lecture_id: uuid.UUID,
    insert_after_slide_index: int,
    question_type: str,
    difficulty: str,
    content: str,
    options: list[str] | None,
    correct_answer: str | None,
    explanation: str | None,
) -> Question:
    """확정된 문제를 형성평가 + 슬라이드 anchor 로 저장. 검증 실패 시 ValueError."""
    content = (content or "").strip()
    if not content:
        raise ValueError("문제 본문이 비어 있습니다.")

    if question_type == "multiple_choice":
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError("객관식 문제는 선택지가 정확히 4개여야 합니다.")
        ca = str(correct_answer).strip() if correct_answer is not None else ""
        if ca not in ("0", "1", "2", "3"):
            raise ValueError("객관식 정답은 0~3 인덱스여야 합니다.")
        correct_answer = ca
    else:
        options = None

    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    timestamp = _boundary_timestamp(db, lecture_id, insert_after_slide_index)

    # 같은 경계에 이미 저작된 문제가 있으면 교체 — 경계당 1문항을 유지(재작성 idempotent).
    existing = (
        db.execute(
            select(Question).where(
                Question.lecture_id == lecture_id,
                Question.insert_after_slide_index == insert_after_slide_index,
            )
        )
        .scalars()
        .all()
    )
    for old in existing:
        db.delete(old)

    q = Question(
        lecture_id=lecture_id,
        assessment_type=AssessmentType.formative,
        question_type=QuestionType(question_type),
        difficulty=Difficulty(difficulty),
        content=content,
        options=options,
        correct_answer=correct_answer,
        explanation=explanation,
        timestamp_seconds=timestamp,
        insert_after_slide_index=insert_after_slide_index,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


# ── 목록/삭제 ─────────────────────────────────────────────────────────────────

def list_authored(db: Session, lecture_id: uuid.UUID) -> list[Question]:
    """슬라이드 경계에 anchor 된(인터랙티브) 문제만 반환."""
    rows = (
        db.execute(
            select(Question)
            .where(
                Question.lecture_id == lecture_id,
                Question.insert_after_slide_index.isnot(None),
            )
            .order_by(Question.insert_after_slide_index)
        )
        .scalars()
        .all()
    )
    return list(rows)


def delete_authored(db: Session, lecture_id: uuid.UUID, question_id: uuid.UUID) -> bool:
    """인터랙티브 문제 1개 삭제(재작성용). 성공 시 True."""
    q = db.get(Question, question_id)
    if not q or q.lecture_id != lecture_id or q.insert_after_slide_index is None:
        return False
    db.delete(q)
    db.commit()
    return True
