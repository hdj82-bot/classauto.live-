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
