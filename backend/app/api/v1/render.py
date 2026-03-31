"""렌더링 파이프라인 API (app/api/routes.py 흡수)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.models.video_render import VideoRender

router = APIRouter(prefix="/api/v1/render", tags=["render"])


@router.post("", summary="렌더링 요청 (슬라이드별)")
async def create_render_request(
    lecture_id: uuid.UUID,
    scripts: list[dict],
    avatar_id: str | None = None,
    tts_provider: str = "elevenlabs",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    from app.services.pipeline.subscription import check_limit, PlanLimitExceeded
    from app.tasks.render import render_slide

    try:
        await check_limit(db, user.id, requested=len(scripts))
    except PlanLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    render_ids = []
    for s in scripts:
        render = VideoRender(
            lecture_id=lecture_id,
            instructor_id=user.id,
            avatar_id=avatar_id or "",
            tts_provider=tts_provider,
            script_text=s.get("script", ""),
            slide_number=s.get("slide_number"),
        )
        db.add(render)
        await db.flush()
        render_ids.append(str(render.id))

    await db.commit()

    for rid, s in zip(render_ids, scripts):
        render_slide.delay(rid, s.get("script", ""))

    return {"render_ids": render_ids, "message": "렌더링 파이프라인이 시작되었습니다."}


@router.get("/lecture/{lecture_id}", summary="강의별 렌더 상태")
async def get_lecture_render_status(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    result = await db.execute(
        select(VideoRender).where(VideoRender.lecture_id == lecture_id).order_by(VideoRender.slide_number)
    )
    renders = list(result.scalars().all())
    completed = sum(1 for r in renders if r.status.value == "READY")
    failed = sum(1 for r in renders if r.status.value == "FAILED")

    return {
        "lecture_id": str(lecture_id),
        "total": len(renders),
        "completed": completed,
        "failed": failed,
        "renders": [
            {
                "id": str(r.id),
                "slide_number": r.slide_number,
                "status": r.status.value,
                "s3_video_url": r.s3_video_url,
                "error_message": r.error_message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in renders
        ],
    }


@router.post("/upload", summary="PPT 업로드 → 5단계 파이프라인 시작")
async def upload_ppt(
    lecture_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    import os
    from app.tasks.pipeline import start_pipeline

    if not file.filename or not file.filename.endswith(".pptx"):
        raise HTTPException(status_code=400, detail=".pptx 파일만 업로드 가능합니다.")

    task_id = str(uuid.uuid4())
    upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads")
    os.makedirs(os.path.join(upload_dir, task_id), exist_ok=True)
    file_path = os.path.join(upload_dir, task_id, file.filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    result = start_pipeline(task_id, file_path, str(user.id), str(lecture_id))

    return {"task_id": task_id, "celery_task_id": result.id, "message": "파이프라인이 시작되었습니다."}
