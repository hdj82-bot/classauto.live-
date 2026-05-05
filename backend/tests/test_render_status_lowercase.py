"""RenderStatus enum value 케이싱 회귀 가드.

다른 enum (SessionStatus, PlanType 등) 패턴과 일치하도록 lowercase 로 통일.
누군가 다시 UPPER 로 회귀시키면 즉시 차단.
"""
from __future__ import annotations

import pytest

from app.models.session import SessionStatus
from app.models.video_render import RenderStatus


@pytest.mark.parametrize(
    "member,expected_value",
    [
        (RenderStatus.pending, "pending"),
        (RenderStatus.tts_processing, "tts_processing"),
        (RenderStatus.rendering, "rendering"),
        (RenderStatus.uploading, "uploading"),
        (RenderStatus.ready, "ready"),
        (RenderStatus.failed, "failed"),
        (RenderStatus.cancelled, "cancelled"),
    ],
)
def test_render_status_value_is_lowercase(member, expected_value):
    """value 가 lowercase 인지 확인 — UPPER 로 회귀시 즉시 실패."""
    assert member.value == expected_value
    assert member.value == member.value.lower()


def test_render_status_member_name_matches_value():
    """멤버 이름과 value 가 동일 — SessionStatus 패턴과 일치."""
    for member in RenderStatus:
        assert member.name == member.value, (
            f"RenderStatus.{member.name} 의 value 가 {member.value!r} — "
            f"이름과 일치해야 함"
        )


def test_render_status_str_inheritance():
    """RenderStatus(str, Enum) — 문자열 비교가 그대로 동작."""
    assert RenderStatus.pending == "pending"
    assert RenderStatus.ready != "READY"  # 회귀 가드: 더이상 UPPER 와 매치 X


def test_session_render_status_casing_consistent():
    """다른 enum 과 동일한 패턴(이름==value)을 따르는지 교차 검증."""
    for member in SessionStatus:
        assert member.name == member.value
    for member in RenderStatus:
        assert member.name == member.value
