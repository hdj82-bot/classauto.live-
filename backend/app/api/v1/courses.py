from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_professor
from app.db.session import get_db
from app.models.user import User
from app.schemas.course import CourseCreate, CourseResponse
from app.services.course import create_course, list_courses

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse], summary="강좌 목록 조회")
async def get_courses(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    - **교수자**: 본인이 만든 전체 강좌 목록
    - **학습자**: 게시된(is_published=true) 강좌 목록
    """
    return await list_courses(db, user)


@router.post(
    "",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="강좌 생성 (교수자 전용)",
)
async def post_course(
    body: CourseCreate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    return await create_course(db, professor, body)
