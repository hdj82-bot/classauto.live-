"""렌더링 작업 헬퍼 — High E: lecture 삭제 시 진행 중 HeyGen 잡 취소."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.video_render import RenderStatus, VideoRender
from app.services.pipeline import heygen as heygen_svc

logger = logging.getLogger(__name__)

try:
    import sentry_sdk
except ImportError:  # pragma: no cover
    sentry_sdk = None  # type: ignore[assignment]


# 진행 중으로 간주하는 상태 — 이 상태의 render 만 cancel 시도.
_IN_FLIGHT_STATUSES: tuple[RenderStatus, ...] = (
    RenderStatus.pending,
    RenderStatus.tts_processing,
    RenderStatus.rendering,
    RenderStatus.uploading,
)


async def cancel_in_flight_renders_for_lecture(
    db: AsyncSession, lecture_id: uuid.UUID
) -> int:
    """해당 lecture 의 진행 중 VideoRender 를 best-effort 로 취소.

    1) status in (pending, tts_processing, rendering, uploading) select
    2) heygen_job_id 가 있으면 heygen.cancel_video 호출 (실패해도 무시)
    3) DB 상태 → cancelled, cancelled_at = now
    4) 호출자(보통 lecture DELETE) 가 이 함수의 예외로 멈추지 않도록
       전체를 try/except 로 감싼다. 실패는 Sentry warning + 로그.

    반환: 취소 마킹된 render 개수.
    """
    try:
        result = await db.execute(
            select(VideoRender).where(
                VideoRender.lecture_id == lecture_id,
                VideoRender.status.in_(_IN_FLIGHT_STATUSES),
            )
        )
        renders: list[VideoRender] = list(result.scalars().all())
    except Exception as exc:
        logger.warning(
            "cancel_in_flight_renders: 조회 실패 lecture_id=%s: %s", lecture_id, exc
        )
        if sentry_sdk is not None:
            sentry_sdk.capture_message(
                f"cancel_in_flight_renders query failed: lecture_id={lecture_id} ({exc})",
                level="warning",
            )
        return 0

    if not renders:
        return 0

    now = datetime.now(timezone.utc)
    cancelled = 0
    for render in renders:
        if render.heygen_job_id:
            try:
                await heygen_svc.cancel_video(render.heygen_job_id)
            except Exception as exc:
                # heygen.cancel_video 자체가 best-effort 지만, 방어적으로 한 번 더 감쌈.
                logger.warning(
                    "HeyGen cancel_video 호출 실패 (무시): render_id=%s, job_id=%s, error=%s",
                    render.id, render.heygen_job_id, exc,
                )
                if sentry_sdk is not None:
                    sentry_sdk.capture_message(
                        f"heygen.cancel_video failed: render_id={render.id} ({exc})",
                        level="warning",
                    )
        render.status = RenderStatus.cancelled
        render.cancelled_at = now
        cancelled += 1

    logger.info(
        "lecture %s 삭제 직전: 진행 중 render %d개를 cancelled 로 마킹", lecture_id, cancelled,
    )
    return cancelled
