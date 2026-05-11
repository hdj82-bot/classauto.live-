"""Celery 인스턴스 설정."""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

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
}

# autodiscover_tasks 제거됨 — 위 include= 로 대체 (Django 스타일 tasks.py 탐색 회피)
