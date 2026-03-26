import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.schemas.lecture import LectureCreate, LecturePublicResponse, LectureUpdate
from app.utils.slug import slugify


# ── 조회 ──────────────────────────────────────────────────────────────────────

async def list_course_lectures(
    db: AsyncSession, course_id: uuid.UUID, user: User
) -> list[Lecture]:
    """교수자(소유자)는 전체, 그 외는 게시된 강의만 반환."""
    stmt = select(Lecture).where(Lecture.course_id == course_id)

    # 강좌 소유자 확인
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if not course:
        raise ValueError("강좌를 찾을 수 없습니다.")

    is_owner = (user.role == UserRole.professor and course.instructor_id == user.id)
    if not is_owner:
        stmt = stmt.where(Lecture.is_published == True)  # noqa: E712

    stmt = stmt.order_by(Lecture.order, Lecture.created_at)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_lecture_or_404(db: AsyncSession, lecture_id: uuid.UUID) -> Lecture:
    result = await db.execute(select(Lecture).where(Lecture.id == lecture_id))
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")
    return lecture


async def get_public_lecture_by_slug(
    db: AsyncSession, slug: str
) -> LecturePublicResponse:
    result = await db.execute(
        select(Lecture).where(Lecture.slug == slug, Lecture.is_published == True)  # noqa: E712
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    is_expired = lecture.expires_at is not None and lecture.expires_at < now

    return LecturePublicResponse(
        id=lecture.id,
        course_id=lecture.course_id,
        title=lecture.title,
        description=lecture.description,
        thumbnail_url=lecture.thumbnail_url,
        slug=lecture.slug,
        is_expired=is_expired,
        video_url=None if is_expired else lecture.video_url,
    )


# ── 생성 / 수정 ───────────────────────────────────────────────────────────────

async def create_lecture(
    db: AsyncSession, instructor: User, data: LectureCreate
) -> Lecture:
    # 강좌 소유권 확인
    course_result = await db.execute(
        select(Course).where(Course.id == data.course_id)
    )
    course = course_result.scalar_one_or_none()
    if not course:
        raise ValueError("강좌를 찾을 수 없습니다.")
    if course.instructor_id != instructor.id:
        raise PermissionError("해당 강좌에 강의를 추가할 권한이 없습니다.")

    slug = slugify(data.title)

    lecture = Lecture(
        id=uuid.uuid4(),
        course_id=data.course_id,
        title=data.title,
        description=data.description,
        video_url=data.video_url,
        thumbnail_url=data.thumbnail_url,
        slug=slug,
        order=data.order,
        expires_at=data.expires_at,
    )
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)
    return lecture


async def update_lecture(
    db: AsyncSession, lecture_id: uuid.UUID, instructor: User, data: LectureUpdate
) -> Lecture:
    lecture = await get_lecture_or_404(db, lecture_id)

    # 강좌 소유권 확인
    course_result = await db.execute(
        select(Course).where(Course.id == lecture.course_id)
    )
    course = course_result.scalar_one_or_none()
    if not course or course.instructor_id != instructor.id:
        raise PermissionError("이 강의를 수정할 권한이 없습니다.")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lecture, field, value)

    await db.commit()
    await db.refresh(lecture)
    return lecture
