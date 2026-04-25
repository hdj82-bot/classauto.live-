"""Celery 인스턴스 설정."""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery = Celery(
    "ifl_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
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

celery.autodiscover_tasks(["app.tasks"])
