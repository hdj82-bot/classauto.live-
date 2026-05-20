"""교수자 폴더(컬렉션) API.

강의를 묶어 관리하기 위한 단순 컬렉션. 강의 자체는 여전히 강좌(Course)에 속하며,
폴더는 ``lectures.folder_id`` (옵션 FK)로 연결되는 별개의 정리 수단이다.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.schemas.folder import (
    FolderCreate,
    FolderResponse,
    FolderUpdate,
    LectureMoveRequest,
)
from app.schemas.lecture import LectureResponse
from app.services.folder import (
    create_folder,
    delete_folder,
    list_folders,
    move_lecture_to_folder,
    update_folder,
)

router = APIRouter(tags=["folders"])


@router.get(
    "/api/folders",
    response_model=list[FolderResponse],
    summary="내 폴더 목록 (교수자 전용)",
)
async def get_my_folders(
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    return await list_folders(db, professor)


@router.post(
    "/api/folders",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="폴더 생성 (교수자 전용)",
)
async def post_folder(
    body: FolderCreate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    folder = await create_folder(db, professor, body)
    return FolderResponse(
        id=folder.id,
        instructor_id=folder.instructor_id,
        name=folder.name,
        order=folder.order,
        lecture_count=0,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.patch(
    "/api/folders/{folder_id}",
    response_model=FolderResponse,
    summary="폴더 이름/순서 수정 (교수자 전용)",
)
async def patch_folder(
    folder_id: uuid.UUID,
    body: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    try:
        folder = await update_folder(db, folder_id, professor, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return FolderResponse(
        id=folder.id,
        instructor_id=folder.instructor_id,
        name=folder.name,
        order=folder.order,
        lecture_count=0,  # 정확한 값이 필요하면 list_folders 재호출.
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.delete(
    "/api/folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="폴더 삭제 (교수자 전용) — 소속 강의는 미분류로 풀림",
)
async def delete_folder_endpoint(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    try:
        await delete_folder(db, folder_id, professor)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return None


@router.patch(
    "/api/lectures/{lecture_id}/folder",
    response_model=LectureResponse,
    summary="강의를 폴더로 이동 (folder_id=null 이면 미분류)",
)
async def move_lecture_endpoint(
    lecture_id: uuid.UUID,
    body: LectureMoveRequest,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    try:
        return await move_lecture_to_folder(
            db, lecture_id, body.folder_id, professor
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
