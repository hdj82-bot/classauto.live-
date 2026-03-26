"""IFL HeyGen — API 라우트 (렌더 요청 / 상태 조회)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import (
    LectureRenderStatusResponse,
    PlanLimitExceededResponse,
    RenderRequest,
    RenderResponse,
    RenderStatusResponse,
)
from app.models.video import VideoRender
from app.services.subscription import PlanLimitExceeded, check_limit
from app.tasks.render import process_render

router = APIRouter(prefix="/api/v1/render", tags=["render"])


@router.post(
    "",
    response_model=RenderResponse,
    responses={429: {"model": PlanLimitExceededResponse, "description": "월간 한도 초과"}},
)
async def request_render(
    body: RenderRequest,
    db: AsyncSession = Depends(get_db),
):
    """슬라이드별 아바타 렌더링 요청을 생성하고 Celery 태스크를 큐잉한다.

    요청한 슬라이드 수가 월간 잔여 한도를 초과하면 429를 반환한다.
    """
    # ── 플랜 한도 검사 ──────────────────────────────────────
    try:
        await check_limit(db, body.instructor_id, requested=len(body.scripts))
    except PlanLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "PLAN_LIMIT_EXCEEDED",
                "detail": str(exc),
                "plan": exc.plan,
                "monthly_limit": exc.monthly_limit,
                "used": exc.used,
            },
        )

    # ── 렌더 생성 ───────────────────────────────────────────
    render_ids: list[uuid.UUID] = []

    for script_input in body.scripts:
        render = VideoRender(
            lecture_id=body.lecture_id,
            instructor_id=body.instructor_id,
            avatar_id=body.avatar_id or "",
            tts_provider=body.tts_provider.value,
            script_text=script_input.script,
            slide_number=script_input.slide_number,
            status="PENDING",
        )
        db.add(render)
        await db.flush()
        render_ids.append(render.id)

    await db.commit()

    # Celery 태스크 큐잉
    for rid in render_ids:
        process_render.delay(str(rid))

    return RenderResponse(render_ids=render_ids)


@router.get("/lecture/{lecture_id}", response_model=LectureRenderStatusResponse)
async def get_lecture_render_status(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """강의 전체 렌더링 상태를 조회한다."""
    stmt = (
        select(VideoRender)
        .where(VideoRender.lecture_id == lecture_id)
        .order_by(VideoRender.slide_number)
    )
    result = await db.execute(stmt)
    renders = result.scalars().all()

    if not renders:
        raise HTTPException(status_code=404, detail="해당 강의의 렌더링 작업이 없습니다.")

    return LectureRenderStatusResponse(
        lecture_id=lecture_id,
        total=len(renders),
        completed=sum(1 for r in renders if r.status == "READY"),
        failed=sum(1 for r in renders if r.status == "FAILED"),
        renders=[
            RenderStatusResponse(
                id=r.id,
                lecture_id=r.lecture_id,
                slide_number=r.slide_number,
                status=r.status,
                s3_video_url=r.s3_video_url,
                tts_provider=r.tts_provider,
                error_message=r.error_message,
                created_at=r.created_at,
                completed_at=r.completed_at,
            )
            for r in renders
        ],
    )


@router.get("/{render_id}", response_model=RenderStatusResponse)
async def get_render_status(
    render_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """개별 렌더 작업 상태를 조회한다."""
    render = await db.get(VideoRender, render_id)
    if not render:
        raise HTTPException(status_code=404, detail="렌더링 작업을 찾을 수 없습니다.")

    return RenderStatusResponse(
        id=render.id,
        lecture_id=render.lecture_id,
        slide_number=render.slide_number,
        status=render.status,
        s3_video_url=render.s3_video_url,
        tts_provider=render.tts_provider,
        error_message=render.error_message,
        created_at=render.created_at,
        completed_at=render.completed_at,
    )
