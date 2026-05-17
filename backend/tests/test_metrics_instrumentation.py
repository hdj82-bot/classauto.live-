"""Prometheus 계측 회귀 테스트.

검증:
- ``track_external_api`` (sync/async): 성공 → status=success, 예외 → status=error
  로 ``EXTERNAL_API_CALLS`` 가 증가하고 ``EXTERNAL_API_DURATION`` 이 관측된다.
  예외는 그대로 re-raise 된다.
- Celery 시그널 핸들러가 ``CELERY_TASK_COUNT`` 를 task_name/status 라벨로 증가.

死코드였던 3개 메트릭(CELERY_TASK_COUNT·EXTERNAL_API_CALLS·
EXTERNAL_API_DURATION)이 실제로 와이어링되었음을 강제하는 가드.
"""
from __future__ import annotations

import asyncio

import pytest
from prometheus_client import REGISTRY

from app.celery_app import (
    _metrics_on_task_failure,
    _metrics_on_task_retry,
    _metrics_on_task_success,
)
from app.core.metrics import track_external_api


def _calls(service: str, status: str) -> float:
    return (
        REGISTRY.get_sample_value(
            "ifl_external_api_calls_total",
            {"service": service, "status": status},
        )
        or 0.0
    )


def _duration_count(service: str) -> float:
    return (
        REGISTRY.get_sample_value(
            "ifl_external_api_duration_seconds_count", {"service": service}
        )
        or 0.0
    )


def _task_count(task_name: str, status: str) -> float:
    return (
        REGISTRY.get_sample_value(
            "ifl_celery_tasks_total",
            {"task_name": task_name, "status": status},
        )
        or 0.0
    )


# ── track_external_api: sync ────────────────────────────────────────────────


def test_track_external_api_sync_success():
    before_calls = _calls("unit_svc", "success")
    before_dur = _duration_count("unit_svc")

    @track_external_api("unit_svc")
    def ok():
        return 42

    assert ok() == 42
    assert _calls("unit_svc", "success") == before_calls + 1
    assert _duration_count("unit_svc") == before_dur + 1


def test_track_external_api_sync_error_reraises_and_counts():
    before = _calls("unit_svc_err", "error")

    @track_external_api("unit_svc_err")
    def boom():
        raise ValueError("외부 호출 실패")

    with pytest.raises(ValueError, match="외부 호출 실패"):
        boom()
    assert _calls("unit_svc_err", "error") == before + 1


# ── track_external_api: async ───────────────────────────────────────────────


def test_track_external_api_async_success_and_error():
    before_ok = _calls("unit_async", "success")
    before_err = _calls("unit_async", "error")

    @track_external_api("unit_async")
    async def aok():
        return "ok"

    @track_external_api("unit_async")
    async def aboom():
        raise RuntimeError("async 실패")

    assert asyncio.run(aok()) == "ok"
    with pytest.raises(RuntimeError, match="async 실패"):
        asyncio.run(aboom())

    assert _calls("unit_async", "success") == before_ok + 1
    assert _calls("unit_async", "error") == before_err + 1


def test_track_external_api_preserves_metadata():
    @track_external_api("meta_svc")
    def documented():
        """원본 docstring."""

    assert documented.__name__ == "documented"
    assert documented.__doc__ == "원본 docstring."


# ── Celery 시그널 핸들러 ─────────────────────────────────────────────────────


class _FakeSender:
    def __init__(self, name: str):
        self.name = name


def test_celery_signal_handlers_increment_by_name_and_status():
    name = "app.tasks.polling.poll_pending_renders"
    s, f, r = (
        _task_count(name, "success"),
        _task_count(name, "failure"),
        _task_count(name, "retry"),
    )

    _metrics_on_task_success(sender=_FakeSender(name))
    _metrics_on_task_failure(sender=_FakeSender(name))
    _metrics_on_task_retry(sender=_FakeSender(name))

    assert _task_count(name, "success") == s + 1
    assert _task_count(name, "failure") == f + 1
    assert _task_count(name, "retry") == r + 1


def test_celery_signal_handlers_noop_without_sender():
    # sender 가 없으면(시그널 일부 케이스) 조용히 무시 — 예외 없이.
    _metrics_on_task_success(sender=None)
    _metrics_on_task_failure(sender=None)
    _metrics_on_task_retry(sender=None)
