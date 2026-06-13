"""Celery 인스턴스 설정."""
from celery import Celery
from celery.schedules import crontab
from celery.signals import task_failure, task_retry, task_success

from app.core.config import settings
from app.core.metrics import CELERY_TASK_COUNT

celery = Celery(
    "ifl_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    # autodiscover_tasks 는 Django 컨벤션이라 app/tasks/tasks.py 만 찾는다.
    # 우리 구조는 polling.py/cleanup.py/backup.py/render.py/pipeline.py 로 분산되어 있어
    # include= 로 명시 등록해야 worker 가 task 를 받는다.
    include=[
        "app.tasks.polling",
        "app.tasks.cleanup",
        "app.tasks.backup",
        "app.tasks.render",
        "app.tasks.pipeline",
        "app.tasks.photo_avatar",
        "app.tasks.export",
        "app.tasks.qa_batch",
    ],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# 스케줄 태스크
celery.conf.beat_schedule = {
    "poll-heygen-pending-jobs": {
        "task": "app.tasks.polling.poll_pending_renders",
        "schedule": settings.POLLING_INTERVAL_SECONDS,  # 10분 간격
    },
    "cleanup-stale-sessions": {
        "task": "app.tasks.cleanup.cleanup_stale_sessions",
        "schedule": 3600,  # 1시간 간격
    },
    "daily-db-backup": {
        "task": "app.tasks.backup.daily_db_backup",
        "schedule": crontab(hour=3, minute=0),  # UTC 03:00 = KST 12:00
    },
    "reap-stuck-photo-avatar-looks": {
        "task": "app.tasks.photo_avatar.reap_stuck_looks",
        "schedule": 300,  # 5분 간격 — 정체된 룩을 failed 로 정리(누적 cap 회복)
    },
    "reap-stuck-renders": {
        "task": "app.tasks.render.reap_stuck_renders",
        "schedule": 300,  # 5분 간격 — 워커 재시작 등으로 멈춘 슬라이드 렌더 자가 회복
    },
    "reap-stuck-videos": {
        "task": "app.tasks.render.reap_stuck_videos",
        "schedule": 300,  # 5분 간격 — 전 슬라이드 ready 인데 rendering 에 갇힌 Video 회복
    },
    # 아바타 Q&A 야간 배치 — pending 질문 클러스터링 → 상위 클러스터 렌더 (08/09 §5).
    # 실시간 렌더 금지이므로 하루 1회. 기본 18:00 UTC = KST 03:00.
    "qa-avatar-nightly-batch": {
        "task": "app.tasks.qa_batch.run_qa_avatar_batch",
        "schedule": crontab(hour=settings.QA_AVATAR_BATCH_HOUR_UTC, minute=0),
    },
}

# autodiscover_tasks 제거됨 — 위 include= 로 대체 (Django 스타일 tasks.py 탐색 회피)


# ── Prometheus: 태스크 결과 계측 ─────────────────────────────────────────────
# @task 데코레이터를 건드리지 않고 Celery 시그널 한 곳에서 전 태스크를 균일하게
# 집계한다(중복 0). sender 는 태스크 객체이므로 sender.name = 등록된 태스크명
# (예: "app.tasks.polling.poll_pending_renders") — 카디널리티가 태스크 수로 고정.


@task_success.connect
def _metrics_on_task_success(sender=None, **_kwargs) -> None:
    if sender is not None:
        CELERY_TASK_COUNT.labels(task_name=sender.name, status="success").inc()


@task_failure.connect
def _metrics_on_task_failure(sender=None, **_kwargs) -> None:
    if sender is not None:
        CELERY_TASK_COUNT.labels(task_name=sender.name, status="failure").inc()


@task_retry.connect
def _metrics_on_task_retry(sender=None, **_kwargs) -> None:
    if sender is not None:
        CELERY_TASK_COUNT.labels(task_name=sender.name, status="retry").inc()
