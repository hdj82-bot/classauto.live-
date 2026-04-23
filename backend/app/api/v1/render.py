"""렌더링 파이프라인 API (app/api/routes.py 흡수)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.models.video_render import VideoRender
from app.services.lecture import assert_professor_owns_lecture

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

    await assert_professor_owns_lecture(db, lecture_id, user.id)

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
    await assert_professor_owns_lecture(db, lecture_id, user.id)

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


@router.post("/upload", summary="PPT 업로드 → S3 저장 → 5단계 파이프라인 시작")
async def upload_ppt(
    lecture_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    from app.services.pipeline import s3 as s3_svc
    from app.tasks.pipeline import start_pipeline

    await assert_professor_owns_lecture(db, lecture_id, user.id)

    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail=".pptx 파일만 업로드 가능합니다.")

    # Content-Type 검증
    allowed_types = {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/octet-stream",  # 일부 브라우저에서 전송
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 Content-Type: {file.content_type}")

    # 파일 크기 제한 (100MB)
    MAX_FILE_SIZE = 100 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="파일 크기가 100MB를 초과합니다.")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")
    task_id = str(uuid.uuid4())

    # S3에 PPT 업로드 (매직바이트 검증 포함)
    try:
        s3_url, s3_key = s3_svc.upload_ppt(content, str(lecture_id), file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = start_pipeline(task_id, s3_key, str(user.id), str(lecture_id))

    return {
        "task_id": task_id,
        "celery_task_id": result.id,
        "s3_url": s3_url,
        "message": "S3 업로드 완료, 파이프라인이 시작되었습니다.",
    }


@router.get("/avatars", summary="HeyGen 아바타 목록 조회")
async def list_avatars(user: User = Depends(require_professor)):
    from app.services.pipeline.heygen import list_avatars as heygen_list_avatars, HeyGenError

    try:
        avatars = await heygen_list_avatars()
        return {"avatars": avatars, "total": len(avatars)}
    except HeyGenError as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API 오류: {e}")


@router.get("/quota", summary="HeyGen 잔여 크레딧 조회")
async def get_quota(user: User = Depends(require_professor)):
    from app.services.pipeline.heygen import get_remaining_quota, HeyGenError

    try:
        quota = await get_remaining_quota()
        return quota
    except HeyGenError as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API 오류: {e}")
