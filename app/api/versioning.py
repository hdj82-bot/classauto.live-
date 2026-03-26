"""영상 버전 관리 + 수정 경고 API."""

from __future__ import annotations

from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video, VideoStatus
from app.services.versioning import (
    archive_session_logs,
    create_version_snapshot,
    bump_version,
    get_active_viewers,
)

router = APIRouter(prefix="/api/v1", tags=["versioning"])


# --------------------------------------------------------------------------
# 스키마
# --------------------------------------------------------------------------

class EditCheckResponse(BaseModel):
    task_id: str
    current_version: int
    active_viewers: int
    warning: bool
    message: str


class EditAction(str, Enum):
    NEXT_SEMESTER = "next_semester"   # 다음 학기에 적용
    EDIT_NOW = "edit_now"             # 지금 바로 수정


class EditConfirmRequest(BaseModel):
    action: EditAction


class EditConfirmResponse(BaseModel):
    task_id: str
    action: EditAction
    new_version: int | None = None
    archived_sessions: int = 0
    message: str


class VersionItem(BaseModel):
    version: int
    s3_url: str | None
    status: str
    created_at: str


class VersionListResponse(BaseModel):
    task_id: str
    current_version: int
    versions: list[VersionItem]


# --------------------------------------------------------------------------
# GET /videos/{task_id}/edit-check — 수정 전 시청자 확인
# --------------------------------------------------------------------------

@router.get("/videos/{task_id}/edit-check", response_model=EditCheckResponse)
async def edit_check(task_id: str, db: Session = Depends(get_db)):
    """영상 수정 시도 시 현재 시청자 수를 확인한다."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    viewers = get_active_viewers(db, video.id)
    warning = viewers.count > 0

    if warning:
        message = (
            f"현재 {viewers.count}명의 학습자가 시청 중입니다. "
            "지금 수정하면 기존 학습 데이터가 아카이브됩니다."
        )
    else:
        message = "현재 시청 중인 학습자가 없습니다. 안전하게 수정할 수 있습니다."

    return EditCheckResponse(
        task_id=task_id,
        current_version=video.version,
        active_viewers=viewers.count,
        warning=warning,
        message=message,
    )


# --------------------------------------------------------------------------
# POST /videos/{task_id}/edit-confirm — 경고 팝업 응답 처리
# --------------------------------------------------------------------------

@router.post("/videos/{task_id}/edit-confirm", response_model=EditConfirmResponse)
async def edit_confirm(
    task_id: str,
    body: EditConfirmRequest,
    db: Session = Depends(get_db),
):
    """수정 경고 팝업에 대한 교수자 응답을 처리한다.

    - next_semester: 현재 버전 유지, 수정 예약만 기록
    - edit_now: 기존 세션 아카이브 → 버전 스냅샷 생성 → 버전 증가
    """
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    if body.action == EditAction.NEXT_SEMESTER:
        return EditConfirmResponse(
            task_id=task_id,
            action=body.action,
            new_version=None,
            message="다음 학기에 수정 사항이 적용됩니다. 현재 버전이 유지됩니다.",
        )

    # edit_now: 아카이브 + 버전 스냅샷 + 버전 증가
    create_version_snapshot(db, video)
    archived_count = archive_session_logs(db, video.id, video.version)
    new_ver = bump_version(db, video)

    # 상태를 다시 PENDING_REVIEW로 되돌려 수정 가능 상태로 전환
    video.status = VideoStatus.PENDING_REVIEW
    db.commit()

    return EditConfirmResponse(
        task_id=task_id,
        action=body.action,
        new_version=new_ver,
        archived_sessions=archived_count,
        message=f"v{new_ver}로 업데이트되었습니다. {archived_count}개 세션이 아카이브되었습니다.",
    )


# --------------------------------------------------------------------------
# GET /videos/{task_id}/versions — 버전 이력 조회
# --------------------------------------------------------------------------

@router.get("/videos/{task_id}/versions", response_model=VersionListResponse)
async def get_versions(task_id: str, db: Session = Depends(get_db)):
    """영상의 전체 버전 이력을 반환한다."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    items = [
        VersionItem(
            version=v.version,
            s3_url=v.s3_url,
            status=v.status,
            created_at=v.created_at.isoformat(),
        )
        for v in sorted(video.versions, key=lambda v: v.version)
    ]

    return VersionListResponse(
        task_id=task_id,
        current_version=video.version,
        versions=items,
    )
