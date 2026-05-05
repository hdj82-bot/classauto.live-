"""렌더링 비용 로그 서비스."""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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


def record_once_committed(
    sessionmaker,
    video_render_id: uuid.UUID,
    service: str,
    operation: str,
    cost_usd: float = 0.0,
    duration_seconds: float | None = None,
    metadata: dict | None = None,
) -> bool:
    """비용 로그를 **별도 짧은 트랜잭션** 으로 즉시 커밋한다.

    H: 외부 API 호출(예: ElevenLabs TTS) 이 성공한 직후 — 후속 단계(S3 업로드 등)가
    실패해도 비용 기록은 살아남아야 한다. 호출자 세션에서 ``record_once`` 를 사용하면
    같은 트랜잭션 안에서 후속 예외가 ``rollback`` 을 트리거할 때 비용 행도 함께 사라진다.
    이 함수는 ``sessionmaker`` 로 새 세션을 열어 ``record_once`` + ``commit`` 후 닫는다.

    인자:
        sessionmaker: 동기 ``sessionmaker`` 또는 ``SyncSessionLocal`` 같은 호출 가능 객체.

    반환:
        True  — 새로 기록 성공 (또는 이미 존재해 idempotent skip — 둘 다 외부 입장에선 OK)
        False — DB 오류로 기록 실패 (예외는 삼키고 로깅 — 비용 회계는 실패해도 호출 흐름을 막지 않음)
    """
    try:
        db = sessionmaker()
    except Exception as exc:
        logger.error("record_once_committed 세션 열기 실패: %s", exc)
        return False
    try:
        try:
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
                return True

            log = RenderCostLog(
                video_render_id=video_render_id,
                service=service,
                operation=operation,
                cost_usd=cost_usd,
                duration_seconds=duration_seconds,
                metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
            )
            db.add(log)
            db.commit()
            logger.info(
                "비용 기록(committed): service=%s, operation=%s, cost=$%.4f, render_id=%s",
                service, operation, cost_usd, video_render_id,
            )
            return True
        except IntegrityError:
            # UNIQUE(video_render_id, operation) 충돌 — 동시 실행 race. idempotent 로 OK.
            db.rollback()
            logger.info(
                "비용 기록(committed) UNIQUE 충돌 — idempotent skip: operation=%s, render_id=%s",
                operation, video_render_id,
            )
            return True
        except Exception as exc:
            db.rollback()
            logger.error(
                "비용 기록(committed) 실패: operation=%s, render_id=%s, error=%s",
                operation, video_render_id, exc,
            )
            return False
    finally:
        db.close()
