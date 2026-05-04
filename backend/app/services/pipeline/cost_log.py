"""렌더링 비용 로그 서비스."""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.video_render import RenderCostLog

logger = logging.getLogger(__name__)


def record(
    db: Session,
    video_render_id: uuid.UUID,
    service: str,
    operation: str,
    cost_usd: float = 0.0,
    duration_seconds: float | None = None,
    metadata: dict | None = None,
) -> RenderCostLog:
    log = RenderCostLog(
        video_render_id=video_render_id,
        service=service,
        operation=operation,
        cost_usd=cost_usd,
        duration_seconds=duration_seconds,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
    )
    db.add(log)
    db.flush()
    logger.info("비용 기록: service=%s, operation=%s, cost=$%.4f, render_id=%s", service, operation, cost_usd, video_render_id)
    return log


def record_once(
    db: Session,
    video_render_id: uuid.UUID,
    service: str,
    operation: str,
    cost_usd: float = 0.0,
    duration_seconds: float | None = None,
    metadata: dict | None = None,
) -> RenderCostLog | None:
    """동일 (video_render_id, operation) 로그가 이미 있으면 skip — Celery 재시도 시 중복 비용 기록 방지.

    Critical 8: 단계별 1회만 비용 기록되도록 idempotent 보장.
    인덱스 (video_render_id, operation) 가 alembic 0012 에서 생성됨 — O(1) 조회.
    """
    existing = db.execute(
        select(RenderCostLog.id).where(
            RenderCostLog.video_render_id == video_render_id,
            RenderCostLog.operation == operation,
        ).limit(1)
    ).first()
    if existing:
        logger.info(
            "비용 기록 skip (이미 존재): operation=%s, render_id=%s",
            operation, video_render_id,
        )
        return None
    return record(
        db=db,
        video_render_id=video_render_id,
        service=service,
        operation=operation,
        cost_usd=cost_usd,
        duration_seconds=duration_seconds,
        metadata=metadata,
    )
