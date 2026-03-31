"""렌더링 비용 로그 서비스."""
from __future__ import annotations

import json
import logging
import uuid

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
