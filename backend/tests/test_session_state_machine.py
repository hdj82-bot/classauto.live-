"""세션 상태머신이 모델 레벨 @validates 훅으로 강제되는지 회귀 테스트.

서비스 레이어(session_svc.update_session_status) 외 경로(직접 ORM 할당,
bulk update 등)에서도 잘못된 전이가 시도되면 ValueError 가 즉시 발생해야 한다.
"""
from __future__ import annotations

import uuid

import pytest

from app.models.session import LearningSession, SessionStatus


def _make_session(status: SessionStatus = SessionStatus.not_started) -> LearningSession:
    return LearningSession(
        user_id=uuid.uuid4(),
        lecture_id=uuid.uuid4(),
        status=status,
    )


# ── 신규 인스턴스 생성: 자유 ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "init_status",
    [
        SessionStatus.not_started,
        SessionStatus.in_progress,
        SessionStatus.assessment,
        SessionStatus.completed,
    ],
)
def test_new_instance_accepts_any_initial_status(init_status):
    s = _make_session(init_status)
    assert s.status == init_status


# ── 정상 전이 ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "frm,to",
    [
        (SessionStatus.not_started, SessionStatus.in_progress),
        (SessionStatus.in_progress, SessionStatus.qa_mode),
        (SessionStatus.in_progress, SessionStatus.paused),
        (SessionStatus.in_progress, SessionStatus.assessment),
        (SessionStatus.in_progress, SessionStatus.completed),
        (SessionStatus.qa_mode, SessionStatus.in_progress),
        (SessionStatus.qa_mode, SessionStatus.paused),
        (SessionStatus.paused, SessionStatus.in_progress),
        (SessionStatus.assessment, SessionStatus.completed),
    ],
)
def test_valid_transitions_pass(frm, to):
    s = _make_session(frm)
    s.status = to  # @validates 가 통과시켜야 한다
    assert s.status == to


# ── 잘못된 전이는 차단 ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "frm,to",
    [
        # terminal 에서 어디로도 갈 수 없음
        (SessionStatus.completed, SessionStatus.in_progress),
        (SessionStatus.completed, SessionStatus.paused),
        # 시작 안 한 상태에서 곧장 평가/완료 불가
        (SessionStatus.not_started, SessionStatus.assessment),
        (SessionStatus.not_started, SessionStatus.completed),
        # paused 에서 다른 상태(in_progress 외)로 못 감
        (SessionStatus.paused, SessionStatus.assessment),
        (SessionStatus.paused, SessionStatus.qa_mode),
        # qa_mode 에서 assessment 로 직접 못 감
        (SessionStatus.qa_mode, SessionStatus.assessment),
        (SessionStatus.qa_mode, SessionStatus.completed),
    ],
)
def test_invalid_transitions_raise(frm, to):
    s = _make_session(frm)
    with pytest.raises(ValueError, match="세션 상태 전이 불가"):
        s.status = to


def test_unknown_status_value_raises():
    s = _make_session(SessionStatus.in_progress)
    with pytest.raises(ValueError, match="Unknown SessionStatus"):
        s.status = "frobnicate"  # type: ignore[assignment]


def test_same_status_assignment_idempotent():
    """같은 상태 재할당은 통과 (idempotent — refresh 후 같은 값 재설정 케이스)."""
    s = _make_session(SessionStatus.in_progress)
    s.status = SessionStatus.in_progress
    assert s.status == SessionStatus.in_progress
