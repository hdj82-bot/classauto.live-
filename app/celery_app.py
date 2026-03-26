from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery = Celery(
    "ifl_pipeline",
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
    # Celery Beat — 주기적 태스크
    beat_schedule={
        "heygen-poll-rendering": {
            "task": "heygen.poll_rendering_status",
            "schedule": 600.0,  # 10분 간격
        },
    },
)

celery.autodiscover_tasks(["app.tasks"])
