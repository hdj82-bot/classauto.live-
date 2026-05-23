"""문제 생성 및 제공 서비스."""
import json
import logging
import random
import re
import uuid
from typing import Any

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.retry import retry_external
from app.models.question import AssessmentType, Question
from app.models.session import LearningSession, SessionStatus

logger = logging.getLogger(__name__)

# Claude SDK 의 일시적 오류만 재시도. 4xx(BadRequestError 등)는 즉시 raise.
_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)


@retry_external(label="claude.questions.generate", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_generate_questions(client: anthropic.Anthropic, user_prompt: str):
    return client.messages.create(
        model=settings.QUESTION_MODEL,
        max_tokens=8192,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )


# ── Claude API 프롬프트 ────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """당신은 대학 강의 평가 문제를 출제하는 전문가입니다.
주어진 PPT 슬라이드 내용을 분석하여 학습자의 이해도를 측정하는 문제를 생성하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "formative": [
    {
      "question_type": "multiple_choice" | "short_answer",
      "difficulty": "easy" | "medium" | "hard",
      "content": "문제 내용",
      "options": ["선택지A", "선택지B", "선택지C", "선택지D"] | null,
      "correct_answer": "0~3 인덱스(객관식) 또는 모범답안(주관식)",
      "explanation": "정답 해설",
      "timestamp_seconds": 영상_출제_시점_초_정수
    }
  ],
  "summative": [
    {
      "question_type": "multiple_choice" | "short_answer",
      "difficulty": "easy" | "medium" | "hard",
      "content": "문제 내용",
      "options": ["선택지A", "선택지B", "선택지C", "선택지D"] | null,
      "correct_answer": "0~3 인덱스(객관식) 또는 모범답안(주관식)",
      "explanation": "정답 해설",
      "timestamp_seconds": null
    }
  ]
}

규칙:
- 형성평가(formative): 강의 중간에 출제. timestamp_seconds는 0~영상길이 범위 내 균등 분포
- 총괄평가(summative): 영상 종료 후 출제. timestamp_seconds는 null
- 객관식은 반드시 options 배열 4개, correct_answer는 "0"~"3" 문자열
- 주관식은 options null, correct_answer는 핵심 키워드 포함 모범답안
- 난이도 비율: easy 30%, medium 50%, hard 20% 권장
"""


def _build_user_prompt(
    ppt_content: str,
    formative_count: int,
    summative_count: int,
    video_duration_seconds: int,
) -> str:
    return (
        f"PPT 슬라이드 내용:\n\n{ppt_content}\n\n"
        f"요청:\n"
        f"- 형성평가 {formative_count}문항 (영상 길이: {video_duration_seconds}초)\n"
        f"- 총괄평가 {summative_count}문항\n"
        f"- timestamp_seconds는 0~{video_duration_seconds} 범위 내 균등 배분\n"
        f"JSON만 응답하세요."
    )


# ── 문제 생성 ─────────────────────────────────────────────────────────────────

async def generate_questions(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    ppt_content: str,
    formative_count: int,
    summative_count: int,
    video_duration_seconds: int,
) -> tuple[int, int]:
    """Claude API로 문제를 생성해 DB에 저장. (formative_created, summative_created) 반환."""

    # 기존 문제가 있으면 중복 생성 방지
    existing = await db.execute(
        select(Question).where(Question.lecture_id == lecture_id).limit(1)
    )
    if existing.scalars().first() is not None:
        logger.info("lecture %s: 이미 문제가 존재하여 생성 건너뜀", lecture_id)
        count_result = await db.execute(
            select(Question).where(Question.lecture_id == lecture_id)
        )
        all_existing = list(count_result.scalars().all())
        f_count = sum(1 for q in all_existing if q.assessment_type == AssessmentType.formative)
        s_count = sum(1 for q in all_existing if q.assessment_type == AssessmentType.summative)
        return f_count, s_count

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)

    try:
        response = _claude_generate_questions(
            client,
            _build_user_prompt(
                ppt_content, formative_count, summative_count, video_duration_seconds,
            ),
        )
    except anthropic.APIError as exc:
        logger.error("Claude API 호출 실패: %s", exc)
        raise RuntimeError(f"문제 생성 API 호출 실패: {exc}") from exc

    # 텍스트 블록에서 JSON 추출
    raw_text = next(
        (block.text for block in response.content if block.type == "text"), ""
    )
    data = _parse_json_response(raw_text)

    formative_items: list[dict] = data.get("formative", [])
    summative_items: list[dict] = data.get("summative", [])

    def _validate_item(item: dict, assessment_type: AssessmentType) -> Question | None:
        """개별 문제 항목을 검증하고 Question 객체를 생성."""
        content = item.get("content")
        question_type = item.get("question_type", "multiple_choice")
        if not content:
            logger.warning("문제 content 누락, 건너뜀: %s", item)
            return None

        # 객관식: options 4개, correct_answer 0~3 검증
        options = item.get("options")
        correct_answer = item.get("correct_answer")
        if question_type == "multiple_choice":
            if not isinstance(options, list) or len(options) != 4:
                logger.warning("객관식 options가 4개가 아님, 건너뜀: %s", item.get("content", "")[:50])
                return None
            if str(correct_answer).strip() not in ("0", "1", "2", "3"):
                logger.warning("객관식 correct_answer 범위 초과: %s", correct_answer)
                return None
            correct_answer = str(correct_answer).strip()

        # 난이도 검증
        difficulty = item.get("difficulty", "medium")
        if difficulty not in ("easy", "medium", "hard"):
            difficulty = "medium"

        # timestamp 검증
        timestamp = item.get("timestamp_seconds")
        if assessment_type == AssessmentType.formative and timestamp is not None:
            if not isinstance(timestamp, (int, float)) or timestamp < 0:
                timestamp = None
            elif video_duration_seconds > 0 and timestamp > video_duration_seconds:
                timestamp = video_duration_seconds
            else:
                timestamp = int(timestamp)
        elif assessment_type == AssessmentType.summative:
            timestamp = None

        return Question(
            lecture_id=lecture_id,
            assessment_type=assessment_type,
            question_type=question_type,
            difficulty=difficulty,
            content=content,
            options=options,
            correct_answer=correct_answer,
            explanation=item.get("explanation"),
            timestamp_seconds=timestamp,
        )

    questions: list[Question] = []
    for item in formative_items:
        q = _validate_item(item, AssessmentType.formative)
        if q:
            questions.append(q)
    for item in summative_items:
        q = _validate_item(item, AssessmentType.summative)
        if q:
            questions.append(q)

    if not questions:
        raise RuntimeError("Claude API가 유효한 문제를 생성하지 못했습니다.")

    db.add_all(questions)
    await db.commit()

    f_created = sum(1 for q in questions if q.assessment_type == AssessmentType.formative)
    s_created = sum(1 for q in questions if q.assessment_type == AssessmentType.summative)
    return f_created, s_created


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    """Claude 응답에서 JSON을 추출. 마크다운 코드블록도 처리."""
    if not raw_text.strip():
        raise RuntimeError("Claude API가 빈 응답을 반환했습니다.")

    # 마크다운 코드 블록 내 JSON 추출 시도
    code_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
    text_to_parse = code_block.group(1) if code_block else raw_text

    try:
        data = json.loads(text_to_parse)
    except json.JSONDecodeError:
        # 중괄호로 감싸진 부분만 추출 시도
        brace_match = re.search(r"\{.*\}", text_to_parse, re.DOTALL)
        if brace_match:
            try:
                data = json.loads(brace_match.group(0))
            except json.JSONDecodeError as exc:
                logger.error("JSON 파싱 최종 실패: %s", raw_text[:500])
                raise RuntimeError("Claude API 응답을 JSON으로 파싱할 수 없습니다.") from exc
        else:
            logger.error("JSON 구조를 찾을 수 없음: %s", raw_text[:500])
            raise RuntimeError("Claude API 응답에서 JSON 구조를 찾을 수 없습니다.")

    if not isinstance(data, dict):
        raise RuntimeError("Claude API 응답이 JSON 객체가 아닙니다.")

    return data


# ── 문제 제공 (랜덤화) ────────────────────────────────────────────────────────

async def get_or_create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    lecture_id: uuid.UUID,
) -> LearningSession:
    """진행 중인 세션을 반환하거나 새로 생성."""
    result = await db.execute(
        select(LearningSession).where(
            LearningSession.user_id == user_id,
            LearningSession.lecture_id == lecture_id,
            LearningSession.status == SessionStatus.in_progress,
        )
    )
    session = result.scalars().first()
    if session:
        return session

    session = LearningSession(user_id=user_id, lecture_id=lecture_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_questions_for_session(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    assessment_type: AssessmentType,
    session_id: uuid.UUID,
    serve_count: int,
) -> tuple[list[Question], int]:
    """세션 ID를 시드로 랜덤화된 문제 목록 반환. (questions, total_in_pool)"""
    result = await db.execute(
        select(Question).where(
            Question.lecture_id == lecture_id,
            Question.assessment_type == assessment_type,
            Question.is_active.is_(True),
        )
    )
    pool: list[Question] = list(result.scalars().all())
    total = len(pool)

    if not pool:
        return [], 0

    # session_id 기반 결정론적 랜덤화
    rng = random.Random(str(session_id))
    rng.shuffle(pool)

    return pool[:serve_count], total
