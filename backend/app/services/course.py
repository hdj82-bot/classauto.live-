import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User, UserRole
from app.schemas.course import CourseCreate


async def list_courses(db: AsyncSession, user: User) -> list[Course]:
    """교수자: 본인 강좌 전체 / 학습자: 게시된 강좌만."""
    if user.role == UserRole.professor:
        stmt = select(Course).where(Course.instructor_id == user.id).order_by(Course.created_at.desc())
    else:
        stmt = select(Course).where(Course.is_published == True).order_by(Course.created_at.desc())  # noqa: E712
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_course_or_404(db: AsyncSession, course_id: uuid.UUID) -> Course:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise ValueError("강좌를 찾을 수 없습니다.")
    return course


async def create_course(db: AsyncSession, instructor: User, data: CourseCreate) -> Course:
    course = Course(
        id=uuid.uuid4(),
        title=data.title,
        description=data.description,
        instructor_id=instructor.id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course
