"""렌더링 파이프라인 API (app/api/routes.py 흡수)."""
import tempfile
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.models.video_render import RenderStatus, VideoRender
from app.services.lecture import assert_professor_owns_lecture

router = APIRouter(prefix="/api/v1/render", tags=["render"])


# 업로드 한도 (Critical 5: 메모리 폭발 방지)
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB
UPLOAD_CHUNK_SIZE = 1024 * 1024       # 1MB
PPTX_MAGIC = b"PK\x03\x04"


# 중복 렌더 차단: 슬라이드가 이미 이 상태들 중 하나면 다시 렌더하지 않는다.
# ready = 이미 완성됨, 나머지 = 진행 중 — HeyGen 크레딧 이중 청구를 막는다.
_DEDUP_BLOCKING_STATUSES: tuple[RenderStatus, ...] = (
    RenderStatus.pending,
    RenderStatus.tts_processing,
    RenderStatus.rendering,
    RenderStatus.uploading,
    RenderStatus.ready,
)


@router.post("", summary="렌더링 요청 (슬라이드별)")
async def create_render_request(
    lecture_id: uuid.UUID,
    scripts: list[dict],
    avatar_id: str | None = None,
    tts_provider: str = "elevenlabs",
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """슬라이드별 렌더링 요청.

    비용 가드(2026-05-27): 같은 (lecture, slide) 가 이미 완료(ready)됐거나 진행
    중이면 force=False(기본)에서는 재렌더를 건너뛴다 — 렌더 버튼 중복 클릭이나
    전체 재실행으로 HeyGen 크레딧이 이중 청구되는 것을 막는다. 스크립트를 고쳐
    실제로 다시 만들어야 할 때만 force=true 로 호출하며, 이때는 해당 슬라이드의
    진행 중 HeyGen 잡을 먼저 취소(고아 청구 방지)한 뒤 새 렌더를 만든다.
    """
    from app.services.pipeline.subscription import check_limit, PlanLimitExceeded
    from app.services.pipeline import heygen as heygen_svc
    from app.tasks.render import render_slide

    await assert_professor_owns_lecture(db, lecture_id, user.id)

    # ── 중복 렌더 차단 가드 ──
    # 이 강의에서 이미 완료/진행 중인 렌더를 슬라이드 번호별로 모은다.
    existing_result = await db.execute(
        select(VideoRender).where(
            VideoRender.lecture_id == lecture_id,
            VideoRender.status.in_(_DEDUP_BLOCKING_STATUSES),
        )
    )
    by_slide: dict[int, list[VideoRender]] = {}
    for r in existing_result.scalars().all():
        if r.slide_number is not None:
            by_slide.setdefault(r.slide_number, []).append(r)

    to_render: list[dict] = []
    skipped_slides: list[int] = []
    seen_slides: set[int] = set()
    now = datetime.now(timezone.utc)

    for s in scripts:
        sn = s.get("slide_number")
        # 같은 요청 안에서 중복으로 들어온 슬라이드도 1회만 처리
        if sn is not None and sn in seen_slides:
            skipped_slides.append(sn)
            continue
        dupes = by_slide.get(sn) if sn is not None else None

        if dupes and not force:
            # 이미 완료/진행 중 — 건너뜀(크레딧 절약)
            skipped_slides.append(sn)
            continue

        if dupes and force:
            # 편집 후 강제 재생성 — 진행 중 잡은 취소하고 cancelled 로 마킹.
            # 이미 ready 인 건 취소 불가(완성됨)이므로 그대로 두고 새 렌더만 추가한다.
            for r in dupes:
                if r.status != RenderStatus.ready:
                    if r.heygen_job_id:
                        await heygen_svc.cancel_video(r.heygen_job_id)
                    r.status = RenderStatus.cancelled
                    r.cancelled_at = now

        if sn is not None:
            seen_slides.add(sn)
        to_render.append(s)

    if not to_render:
        await db.commit()  # force 취소 마킹 반영
        return {
            "render_ids": [],
            "skipped_slides": skipped_slides,
            "message": "모든 슬라이드가 이미 생성됐거나 진행 중입니다. 다시 만들려면 force=true 로 요청하세요.",
        }

    # 과금 한도는 실제로 렌더할 슬라이드 수만 기준으로 검사
    try:
        await check_limit(db, user.id, requested=len(to_render))
    except PlanLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))

    render_ids = []
    for s in to_render:
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

    for rid, s in zip(render_ids, to_render):
        # caller_user_id 전달 — 태스크에서 instructor_id 일치 검증 (Critical 7)
        render_slide.delay(rid, s.get("script", ""), str(user.id))

    msg = f"{len(render_ids)}개 슬라이드 렌더링이 시작되었습니다."
    if skipped_slides:
        msg += f" ({len(skipped_slides)}개는 이미 생성됨 — 건너뜀)"
    return {"render_ids": render_ids, "skipped_slides": skipped_slides, "message": msg}


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
    completed = sum(1 for r in renders if r.status == RenderStatus.ready)
    failed = sum(1 for r in renders if r.status == RenderStatus.failed)

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


async def _stream_upload_to_buffer(file: UploadFile) -> bytes:
    """UploadFile을 청크 단위로 읽어 임시 버퍼에 저장. 한도 초과 시 즉시 중단.

    Critical 5: file.read()는 전체를 메모리에 적재 — 100MB×N 동시 업로드 시 OOM.
    SpooledTemporaryFile은 일정 임계 이하에서는 메모리, 초과 시 디스크로 자동 전환.
    """
    buffer = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    total = 0
    try:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"파일 크기가 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB를 초과합니다.",
                )
            buffer.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")

        buffer.seek(0)
        return buffer.read()
    finally:
        buffer.close()


@router.post("/upload", summary="PPT 업로드 → S3 저장 → 5단계 파이프라인 시작")
async def upload_ppt(
    request: Request,
    lecture_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    from app.services.pipeline import s3 as s3_svc
    from app.tasks.pipeline import start_pipeline

    lecture = await assert_professor_owns_lecture(db, lecture_id, user.id)

    # ── Critical 6: 확장자 검증 (path traversal 방지를 위해 사용자 파일명은 신뢰하지 않음) ──
    original_name = file.filename or ""
    if not original_name.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail=".pptx 파일만 업로드 가능합니다.")

    # Content-Type 화이트리스트
    allowed_types = {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/octet-stream",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 Content-Type: {file.content_type}")

    # ── Critical 5: Content-Length 선검사로 명백한 오버사이즈 즉시 거부 ──
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MAX_UPLOAD_SIZE + 4096:  # 4KB multipart overhead 여유
                raise HTTPException(
                    status_code=413,
                    detail=f"Content-Length가 {MAX_UPLOAD_SIZE // (1024 * 1024)}MB를 초과합니다.",
                )
        except ValueError:
            raise HTTPException(status_code=400, detail="잘못된 Content-Length 헤더")

    # ── Critical 5: 청크 단위 스트리밍 — 한도 초과 시 즉시 중단 ──
    content = await _stream_upload_to_buffer(file)

    # ── Critical 6: 매직바이트(PK\x03\x04) 검증 — 확장자만 위장한 파일 차단 ──
    if len(content) < 4 or content[:4] != PPTX_MAGIC:
        raise HTTPException(status_code=400, detail="유효한 PPTX 파일이 아닙니다 (ZIP 시그니처 불일치).")

    # ── Critical 6: 파일명을 uuid4().hex + .pptx 로 강제 — 사용자 입력 절대 신뢰 X ──
    safe_filename = f"{uuid.uuid4().hex}.pptx"
    task_id = str(uuid.uuid4())

    try:
        s3_url, s3_key = s3_svc.upload_ppt(content, str(lecture_id), safe_filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # pipeline_task_id를 강의에 저장 — Q&A RAG 검색 키로 사용
    lecture.pipeline_task_id = task_id
    await db.commit()

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
