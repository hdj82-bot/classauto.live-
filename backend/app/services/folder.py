"""교수자 폴더(컬렉션) 도메인 서비스.

폴더는 교수자가 자신의 강의를 묶어 관리하는 단순 컬렉션이다. 강의 자체는 여전히
강좌(Course)에 소속되며, 폴더는 별개의 정리 수단으로 동작한다 (강의는 폴더에 1개
또는 0개로 속함).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.folder import Folder
from app.models.lecture import Lecture
from app.models.user import User
from app.schemas.folder import FolderCreate, FolderUpdate


async def list_folders(db: AsyncSession, instructor: User) -> list[dict]:
    """소속 강의 수까지 채워 반환. 응답 모델이 lecture_count 를 요구한다."""
    stmt = (
        select(Folder, func.count(Lecture.id))
        .outerjoin(Lecture, Lecture.folder_id == Folder.id)
        .where(Folder.instructor_id == instructor.id)
        .group_by(Folder.id)
        .order_by(Folder.order, Folder.created_at)
    )
    result = await db.execute(stmt)
    rows = result.all()
    out: list[dict] = []
    for folder, count in rows:
        out.append(
            {
                "id": folder.id,
                "instructor_id": folder.instructor_id,
                "name": folder.name,
                "order": folder.order,
                "lecture_count": int(count or 0),
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
            }
        )
    return out


async def create_folder(
    db: AsyncSession, instructor: User, data: FolderCreate
) -> Folder:
    folder = Folder(
        id=uuid.uuid4(),
        instructor_id=instructor.id,
        name=data.name,
        order=data.order,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


async def _get_folder_owned(
    db: AsyncSession, folder_id: uuid.UUID, instructor: User
) -> Folder:
    result = await db.execute(
        select(Folder).where(
            Folder.id == folder_id, Folder.instructor_id == instructor.id
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise ValueError("폴더를 찾을 수 없습니다.")
    return folder


async def update_folder(
    db: AsyncSession,
    folder_id: uuid.UUID,
    instructor: User,
    data: FolderUpdate,
) -> Folder:
    folder = await _get_folder_owned(db, folder_id, instructor)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(folder, field, value)
    await db.commit()
    await db.refresh(folder)
    return folder


async def delete_folder(
    db: AsyncSession, folder_id: uuid.UUID, instructor: User
) -> None:
    """폴더만 삭제 — 강의의 ``folder_id``는 FK ondelete=SET NULL 로 자동 해제."""
    folder = await _get_folder_owned(db, folder_id, instructor)
    await db.delete(folder)
    await db.commit()


async def move_lecture_to_folder(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    folder_id: uuid.UUID | None,
    instructor: User,
) -> Lecture:
    """강의 → 폴더 이동. folder_id=None 이면 미분류로 보냄.

    검증: lecture 의 강좌가 instructor 소유여야 함. folder 도 동일 교수자 소유여야 함.
    """
    from app.models.course import Course

    stmt = (
        select(Lecture)
        .join(Course, Lecture.course_id == Course.id)
        .where(Lecture.id == lecture_id, Course.instructor_id == instructor.id)
    )
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")

    if folder_id is not None:
        await _get_folder_owned(db, folder_id, instructor)

    lecture.folder_id = folder_id
    await db.commit()
    await db.refresh(lecture)
    return lecture
