"""IFL HeyGen — Celery 인스턴스."""

from celery import Celery

from app.config import settings

celery = Celery(
    "ifl_heygen",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
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
        "schedule": settings.polling_interval_seconds,
    },
}

celery.autodiscover_tasks(["app.tasks"])
