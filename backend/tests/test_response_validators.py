"""SingleResponse Pydantic validator 회귀 테스트."""
from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.response import SingleResponse


def _payload(**overrides):
    base = dict(
        question_id=uuid.uuid4(),
        user_answer="2",
        video_timestamp_seconds=10,
    )
    base.update(overrides)
    return base


# ── user_answer 정규화 ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2", "2"),
        ("  2  ", "2"),
        ("3 ", "3"),
        ("\thello", "hello"),
        ("multi line answer", "multi line answer"),
    ],
)
def test_user_answer_stripped(raw, expected):
    r = SingleResponse(**_payload(user_answer=raw))
    assert r.user_answer == expected


def test_blank_user_answer_rejected():
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(user_answer="   "))


def test_empty_user_answer_rejected():
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(user_answer=""))


def test_overlong_user_answer_rejected():
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(user_answer="a" * 5000))


# ── video_timestamp_seconds 범위 ─────────────────────────────────────────────


def test_negative_timestamp_rejected():
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(video_timestamp_seconds=-1))


def test_oversized_timestamp_rejected():
    # 24h = 86400 → +1 거부
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(video_timestamp_seconds=86_401))


def test_max_timestamp_accepted():
    r = SingleResponse(**_payload(video_timestamp_seconds=86_400))
    assert r.video_timestamp_seconds == 86_400


def test_unrealistic_huge_timestamp_rejected():
    """실제 사고 케이스 — 클라이언트가 999999 초를 보내 채점 우회 시도."""
    with pytest.raises(ValidationError):
        SingleResponse(**_payload(video_timestamp_seconds=999_999))


# ── T5: Response (session_id, question_id) UNIQUE 제약 ─────────────────────


@pytest.mark.asyncio
async def test_response_session_question_unique_constraint(db, professor, lecture):
    """동일 (session_id, question_id) 행 두 개 시 IntegrityError."""
    from sqlalchemy.exc import IntegrityError

    from app.models.question import (
        AssessmentType, Difficulty, Question, QuestionType,
    )
    from app.models.response import Response
    from app.models.session import LearningSession

    session = LearningSession(
        id=uuid.uuid4(),
        user_id=professor.id,
        lecture_id=lecture.id,
    )
    question = Question(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        assessment_type=AssessmentType.formative,
        question_type=QuestionType.multiple_choice,
        difficulty=Difficulty.medium,
        content="문제",
        options=["A", "B", "C", "D"],
        correct_answer="0",
        is_active=True,
    )
    db.add_all([session, question])
    await db.flush()

    db.add(Response(
        id=uuid.uuid4(),
        session_id=session.id,
        question_id=question.id,
        user_answer="0",
        video_timestamp_seconds=5,
    ))
    await db.flush()

    db.add(Response(
        id=uuid.uuid4(),
        session_id=session.id,
        question_id=question.id,
        user_answer="1",
        video_timestamp_seconds=10,
    ))
    with pytest.raises(IntegrityError):
        await db.flush()
