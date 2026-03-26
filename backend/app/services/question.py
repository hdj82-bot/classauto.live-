"""문제 생성 및 제공 서비스."""
import json
import random
import uuid
from typing import Any

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.question import AssessmentType, Question
from app.models.session import LearningSession, SessionStatus


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
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=8192,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": _build_user_prompt(
                    ppt_content, formative_count, summative_count, video_duration_seconds
                ),
            }
        ],
    )

    # 텍스트 블록에서 JSON 추출
    raw_text = next(
        (block.text for block in response.content if block.type == "text"), ""
    )
    data: dict[str, Any] = json.loads(raw_text)

    formative_items: list[dict] = data.get("formative", [])
    summative_items: list[dict] = data.get("summative", [])

    def _make_question(item: dict, assessment_type: AssessmentType) -> Question:
        return Question(
            lecture_id=lecture_id,
            assessment_type=assessment_type,
            question_type=item["question_type"],
            difficulty=item.get("difficulty", "medium"),
            content=item["content"],
            options=item.get("options"),
            correct_answer=item.get("correct_answer"),
            explanation=item.get("explanation"),
            timestamp_seconds=item.get("timestamp_seconds"),
        )

    questions = [
        _make_question(item, AssessmentType.formative) for item in formative_items
    ] + [
        _make_question(item, AssessmentType.summative) for item in summative_items
    ]

    db.add_all(questions)
    await db.commit()

    return len(formative_items), len(summative_items)


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
