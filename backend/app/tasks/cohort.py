"""성취율 추이 일배치 — 강의별 누적 지표를 cohort_daily_metrics 에 스냅샷.

beat 가 하루 1회 호출(KST 23:50). 소급 수집 불가(09 §3)하므로 배포 시점부터
일자별로 쌓여 `/api/v1/dashboard/{lecture_id}/trend` 라인 차트의 원자료가 된다.
"""
from __future__ import annotations

import logging

from app.celery_app import celery
from app.db.session import SyncSessionLocal
from app.services import cohort_metrics

logger = logging.getLogger(__name__)


@celery.task
def snapshot_cohort_daily_metrics() -> dict:
    """세션 보유 전 강의의 오늘(KST) 지표를 스냅샷."""
    db = SyncSessionLocal()
    try:
        day = cohort_metrics.today_kst()
        count = cohort_metrics.snapshot_all(db, day)
        logger.info("성취율 추이 스냅샷 완료: %s · 강의 %d건", day.isoformat(), count)
        return {"date": day.isoformat(), "lectures": count}
    except Exception as exc:  # noqa: BLE001 — 배치는 실패해도 워커를 죽이지 않는다.
        db.rollback()
        logger.error("성취율 추이 스냅샷 실패: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()
