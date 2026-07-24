"""완료 판정 안티치트 — 일시정지 실시간을 서버 경과에서 차감하는지 검증.

종전엔 _server_elapsed_seconds 가 순수 벽시계(now - started_at)라, 영상 길이의
절반을 실시간으로 일시정지·방치한 뒤 watched_sec=total_sec 을 보고하면 완료
상한이 그만큼 부풀려져 인정됐다. total_pause_seconds + 진행 중 일시정지를 빼서
'활성(비-일시정지) 실시간' 만 상한으로 쓰는지 확인한다. DB 불필요(헬퍼 단위).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.models.session import LearningSession
from app.services import session as sess_svc


def _mk(**kw) -> LearningSession:
    s = LearningSession(user_id=uuid.uuid4(), lecture_id=uuid.uuid4())
    s.total_sec = kw.pop("total_sec", 600)
    s.total_pause_seconds = 0
    s.is_paused = False
    s.paused_at = None
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def test_server_elapsed_subtracts_total_pause():
    now = datetime.now(timezone.utc)
    s = _mk(started_at=now - timedelta(seconds=1000), total_pause_seconds=400)
    # 벽시계 ~1000 − 누적 일시정지 400 → 활성 ~600.
    assert 590 <= sess_svc._server_elapsed_seconds(s) <= 610


def test_server_elapsed_subtracts_ongoing_pause():
    now = datetime.now(timezone.utc)
    s = _mk(
        started_at=now - timedelta(seconds=1000),
        is_paused=True,
        paused_at=now - timedelta(seconds=300),
    )
    # 벽시계 ~1000 − 진행 중 일시정지 ~300 → 활성 ~700.
    assert 690 <= sess_svc._server_elapsed_seconds(s) <= 710


def test_apply_pause_state_accumulates_on_resume():
    t0 = datetime.now(timezone.utc)
    s = _mk()
    sess_svc._apply_pause_state(s, True, t0)
    assert s.is_paused is True and s.paused_at == t0

    sess_svc._apply_pause_state(s, False, t0 + timedelta(seconds=120))
    assert s.is_paused is False
    assert s.paused_at is None
    assert s.total_pause_seconds == 120


def test_apply_pause_state_is_idempotent():
    t0 = datetime.now(timezone.utc)
    s = _mk()
    sess_svc._apply_pause_state(s, True, t0)
    # 이미 일시정지인데 또 pause → paused_at 갱신되지 않아야(구간 이중 계산 방지).
    sess_svc._apply_pause_state(s, True, t0 + timedelta(seconds=50))
    assert s.paused_at == t0
    # 이미 재생중인데 또 resume → 누적 없음.
    sess_svc._apply_pause_state(s, False, t0 + timedelta(seconds=100))
    sess_svc._apply_pause_state(s, False, t0 + timedelta(seconds=200))
    assert s.total_pause_seconds == 100


def test_max_watchable_shrinks_with_pause():
    # 안티치트 핵심: 같은 벽시계라도 일시정지가 있으면 완료 상한이 더 작다.
    now = datetime.now(timezone.utc)
    no_pause = _mk(started_at=now - timedelta(seconds=600), total_pause_seconds=0)
    with_pause = _mk(started_at=now - timedelta(seconds=600), total_pause_seconds=300)
    assert (
        sess_svc._max_server_watchable(with_pause)
        < sess_svc._max_server_watchable(no_pause)
    )
