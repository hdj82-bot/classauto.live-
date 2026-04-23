import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_professor
from app.db.session import get_db
from app.models.user import User
from app.models.video import Video
from app.schemas.lecture import (
    LectureCreate,
    LecturePublicResponse,
    LectureResponse,
    LectureUpdate,
)
from app.schemas.video import VideoStatusResponse
from app.services.lecture import (
    assert_professor_owns_lecture,
    create_lecture,
    get_public_lecture_by_slug,
    list_course_lectures,
    update_lecture,
)

router = APIRouter(tags=["lectures"])


# ── 강좌별 강의 목록 ──────────────────────────────────────────────────────────

@router.get(
    "/api/courses/{course_id}/lectures",
    response_model=list[LectureResponse],
    summary="강좌별 강의 목록",
)
async def get_course_lectures(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    - **교수자(소유자)**: 미게시 포함 전체 강의 목록
    - **학습자 / 타 교수자**: 게시된 강의만
    """
    try:
        return await list_course_lectures(db, course_id, user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── 강의 생성 ─────────────────────────────────────────────────────────────────

@router.post(
    "/api/lectures",
    response_model=LectureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="강의 생성 (교수자 전용)",
)
async def post_lecture(
    body: LectureCreate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """
    강의를 생성합니다. 제목에서 slug가 자동 생성됩니다.

    - `expires_at`: 설정 시 해당 시각 이후 video_url이 공개 엔드포인트에서 숨겨집니다.
    - `order`: 강좌 내 노출 순서 (낮을수록 앞)
    """
    try:
        return await create_lecture(db, professor, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


# ── 강의 수정 ─────────────────────────────────────────────────────────────────

@router.patch(
    "/api/lectures/{lecture_id}",
    response_model=LectureResponse,
    summary="강의 수정 (소유 교수자 전용)",
)
async def patch_lecture(
    lecture_id: uuid.UUID,
    body: LectureUpdate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """변경할 필드만 포함해서 보내면 됩니다 (PATCH 방식)."""
    try:
        return await update_lecture(db, lecture_id, professor, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


# ── 강의의 영상 조회 (교수자 전용) ───────────────────────────────────────────

@router.get(
    "/api/lectures/{lecture_id}/video",
    response_model=VideoStatusResponse,
    summary="강의에 연결된 영상 조회 (교수자 전용)",
)
async def get_lecture_video(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """lecture_id로 연결된 Video의 id·status를 반환합니다."""
    await assert_professor_owns_lecture(db, lecture_id, professor.id)
    result = await db.execute(
        select(Video).where(Video.lecture_id == lecture_id)
    )
    video = result.scalars().first()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이 강의에 연결된 영상이 아직 생성되지 않았습니다.",
        )
    return VideoStatusResponse(
        id=video.id,
        status=video.status.value,
        updated_at=video.updated_at,
    )


# ── 공개 강의 조회 (인증 불필요) ──────────────────────────────────────────────

@router.get(
    "/api/lectures/{slug}/public",
    response_model=LecturePublicResponse,
    summary="슬러그로 공개 강의 조회",
)
async def get_public_lecture(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """
    인증 없이 접근 가능한 공개 엔드포인트입니다.

    - `is_published=true` 인 강의만 반환됩니다.
    - `expires_at`이 현재 시각보다 과거이면 `is_expired=true`, `video_url=null` 로 반환됩니다.
    """
    try:
        return await get_public_lecture_by_slug(db, slug)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
