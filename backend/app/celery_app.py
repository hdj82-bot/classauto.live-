"""Celery 인스턴스 설정."""
from celery import Celery

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

# 10분 간격 fallback 폴링 스케줄
celery.conf.beat_schedule = {
    "poll-heygen-pending-jobs": {
        "task": "app.tasks.polling.poll_pending_renders",
        "schedule": settings.POLLING_INTERVAL_SECONDS,
    },
}

celery.autodiscover_tasks(["app.tasks"])
