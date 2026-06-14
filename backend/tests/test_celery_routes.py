"""렌더 전용 큐 라우팅(build_task_routes) 단위 테스트."""
from __future__ import annotations

from app.celery_app import _RENDER_TASK_NAMES, build_task_routes


def test_routes_empty_when_disabled():
    # 기본(off) — 라우트 없음 → 전 태스크 기본 큐(무회귀).
    assert build_task_routes(False, "render") == {}


def test_routes_empty_when_queue_name_blank():
    assert build_task_routes(True, "") == {}


def test_routes_send_render_tasks_to_queue_when_enabled():
    routes = build_task_routes(True, "render")
    # 렌더 I/O 태스크 전부가 render 큐로.
    for name in _RENDER_TASK_NAMES:
        assert routes[name] == {"queue": "render"}
    assert len(routes) == len(_RENDER_TASK_NAMES)


def test_routes_exclude_claude_and_maintenance_tasks():
    routes = build_task_routes(True, "render")
    # 스크립트 생성·번역 등 Claude 호출, 스케줄 유지보수는 기본 큐(라우트에 없음).
    for name in (
        "app.tasks.pipeline.run_pipeline",
        "app.tasks.qa_batch.run_qa_avatar_batch",
        "app.tasks.render.reap_stuck_renders",
        "app.tasks.render.reap_stuck_videos",
        "app.tasks.polling.poll_pending_renders",
        "app.tasks.photo_avatar.reap_stuck_looks",
    ):
        assert name not in routes


def test_custom_queue_name():
    routes = build_task_routes(True, "render-hi")
    assert routes["app.tasks.render.render_slide"] == {"queue": "render-hi"}
