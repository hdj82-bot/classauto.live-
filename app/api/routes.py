"""FastAPI 라우터 — PPT 업로드, 파이프라인 상태 조회, 스크립트 승인."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.schemas import (
    SlideResponse,
    UploadResponse,
    VideoDetailResponse,
)
from app.models.video import Video, VideoStatus
from app.tasks.pipeline import run_pipeline

router = APIRouter(prefix="/api/v1", tags=["pipeline"])


# --------------------------------------------------------------------------
# POST /upload — PPT 업로드 → 파이프라인 시작
# --------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResponse)
async def upload_pptx(file: UploadFile, db: Session = Depends(get_db)):
    """PPTX 파일을 업로드하고 5단계 파이프라인을 시작한다."""

    # 확장자 검증
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail=".pptx 파일만 업로드 가능합니다.")

    # 파일 크기 검증
    contents = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"파일 크기가 {settings.max_file_size_mb}MB를 초과합니다.",
        )

    # 저장
    job_id = uuid.uuid4().hex
    job_dir = settings.upload_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    file_path = job_dir / file.filename
    file_path.write_bytes(contents)

    output_dir = job_dir / "output"
    output_dir.mkdir(exist_ok=True)

    # Video 레코드 생성
    video = Video(
        task_id=job_id,
        filename=file.filename,
        file_path=str(file_path),
        status=VideoStatus.UPLOADING,
    )
    db.add(video)
    db.commit()

    # Celery 5단계 체인 실행
    run_pipeline(job_id, str(file_path), str(output_dir))

    return UploadResponse(task_id=job_id)


# --------------------------------------------------------------------------
# GET /videos/{task_id} — 파이프라인 결과 상세 조회
# --------------------------------------------------------------------------

@router.get("/videos/{task_id}", response_model=VideoDetailResponse)
async def get_video_detail(task_id: str, db: Session = Depends(get_db)):
    """Video + Slide + Script 전체 정보를 반환한다."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    slides_resp: list[SlideResponse] = []
    for slide in sorted(video.slides, key=lambda s: s.slide_number):
        slides_resp.append(
            SlideResponse(
                slide_number=slide.slide_number,
                text_content=slide.text_content,
                speaker_notes=slide.speaker_notes,
                script=slide.script.content if slide.script else None,
                is_approved=bool(slide.script and slide.script.is_approved),
            )
        )

    return VideoDetailResponse(
        task_id=video.task_id,
        filename=video.filename,
        status=video.status,
        total_slides=video.total_slides,
        slides=slides_resp,
        error_message=video.error_message,
    )


# --------------------------------------------------------------------------
# PATCH /videos/{task_id}/slides/{slide_number}/approve — 스크립트 승인
# --------------------------------------------------------------------------

@router.patch("/videos/{task_id}/slides/{slide_number}/approve")
async def approve_script(task_id: str, slide_number: int, db: Session = Depends(get_db)):
    """특정 슬라이드의 스크립트를 승인한다."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    from app.models.video import Slide, Script

    slide = (
        db.query(Slide)
        .filter(Slide.video_id == video.id, Slide.slide_number == slide_number)
        .first()
    )
    if not slide or not slide.script:
        raise HTTPException(status_code=404, detail="해당 슬라이드 또는 스크립트를 찾을 수 없습니다.")

    slide.script.is_approved = 1
    db.commit()

    # 모든 스크립트 승인 시 Video 상태 업데이트
    all_approved = all(
        s.script and s.script.is_approved for s in video.slides if s.script
    )
    if all_approved and video.slides:
        video.status = VideoStatus.APPROVED
        db.commit()

    return {"message": f"슬라이드 {slide_number} 스크립트가 승인되었습니다.", "all_approved": all_approved}
