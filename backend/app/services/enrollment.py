"""수강 등록 서비스 — 스펙 15 1단계.

등록은 **명시적 진입 동작**(`POST /api/v1/enrollments/join`)에서만 생긴다. 세션 시작
시점에 슬그머니 만들면 "lecture_id 만 알면 아무나 세션을 시작한다"는 구멍이 그대로
남기 때문이다(스펙 15 §1.3 · §4.1). 세션 시작은 이미 등록된 학생만 통과한다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.enrollment import (
    ENROLLMENT_ACTIVE,
    ENROLLMENT_SOURCE_LINK,
    ENROLLMENT_WITHDRAWN,
    Enrollment,
)
from app.models.lecture import Lecture


class WithdrawnFromCourse(Exception):
    """제적된 학생이 다시 들어오려 한 경우.

    호출자가 403 으로 바꾼다. 미등록(404/403)과 구분하는 이유는 학생에게 보여줄 문구가
    다르기 때문 — "등록되지 않았습니다"와 "수강이 종료되었습니다"는 학생이 취할 행동이
    다르다(전자는 링크 확인, 후자는 교수 문의).
    """


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def resolve_course_id(
    db: AsyncSession,
    *,
    course_slug: str | None = None,
    lecture_slug: str | None = None,
    lecture_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    """진입 경로별 식별자를 course_id 로 수렴시킨다.

    `/c/[slug]` 는 course_slug, `/v/[slug]` 는 lecture_slug, 세션 시작은 lecture_id 로
    들어오지만 등록은 모두 강좌 단위다.

    NOTE: `courses` 에는 아직 slug 컬럼이 없다(스펙 15 2단계에서 `/c/[slug]` 라우트와
    함께 추가). 그때까지 course_slug 는 강좌 UUID 문자열을 받는다.
    """
    if lecture_id is not None:
        row = await db.execute(
            select(Lecture.course_id).where(Lecture.id == lecture_id)
        )
        return row.scalar_one_or_none()

    if lecture_slug:
        row = await db.execute(
            select(Lecture.course_id).where(Lecture.slug == lecture_slug)
        )
        return row.scalar_one_or_none()

    if course_slug:
        # 2단계에서 courses.slug 가 생기면 여기서 slug 조회로 바꾼다.
        try:
            course_uuid = uuid.UUID(course_slug)
        except (ValueError, AttributeError):
            return None
        row = await db.execute(select(Course.id).where(Course.id == course_uuid))
        return row.scalar_one_or_none()

    return None


async def get_enrollment(
    db: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID
) -> Enrollment | None:
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
        )
    )
    return result.scalar_one_or_none()


async def join_course(
    db: AsyncSession,
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    source: str = ENROLLMENT_SOURCE_LINK,
) -> Enrollment:
    """등록(멱등). 이미 활성이면 그대로 반환한다.

    - 없으면 생성.
    - 이미 ``active`` 면 그대로 반환 — 두 탭을 열거나 새로고침해도 안전해야 한다.
    - ``withdrawn`` 이면 :class:`WithdrawnFromCourse`. **자동 복구하지 않는다** —
      링크로 되살아나면 제적이 아무 의미가 없다. 재등록은 교수자만(스펙 15 §4.2).

    동시에 두 요청이 오면 ``UNIQUE(course_id, student_id)`` 가 하나를 떨어뜨린다.
    그건 오류가 아니라 정상 경로이므로 잡아서 기존 행을 다시 읽는다.
    """
    existing = await get_enrollment(db, course_id, student_id)
    if existing is not None:
        if existing.status == ENROLLMENT_WITHDRAWN:
            raise WithdrawnFromCourse()
        return existing

    enrollment = Enrollment(
        id=uuid.uuid4(),
        course_id=course_id,
        student_id=student_id,
        status=ENROLLMENT_ACTIVE,
        source=source,
    )
    db.add(enrollment)
    try:
        await db.commit()
    except IntegrityError:
        # 동시 요청이 먼저 만들었다 — 경합은 정상 경로다.
        await db.rollback()
        raced = await get_enrollment(db, course_id, student_id)
        if raced is None:
            raise
        if raced.status == ENROLLMENT_WITHDRAWN:
            raise WithdrawnFromCourse() from None
        return raced

    await db.refresh(enrollment)
    return enrollment


async def is_actively_enrolled(
    db: AsyncSession, course_id: uuid.UUID, student_id: uuid.UUID
) -> bool:
    """세션 시작 게이트용 — 활성 등록 존재 여부만 본다."""
    result = await db.execute(
        select(Enrollment.id).where(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
            Enrollment.status == ENROLLMENT_ACTIVE,
        )
    )
    return result.scalar_one_or_none() is not None


async def withdraw(
    db: AsyncSession,
    enrollment: Enrollment,
    withdrawn_by: uuid.UUID,
    note: str | None = None,
) -> Enrollment:
    """제적 — 행을 지우지 않고 상태만 바꾼다(스펙 15 §3.1)."""
    enrollment.status = ENROLLMENT_WITHDRAWN
    enrollment.withdrawn_at = _now()
    enrollment.withdrawn_by = withdrawn_by
    if note is not None:
        enrollment.note = note
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


async def reactivate(db: AsyncSession, enrollment: Enrollment) -> Enrollment:
    """재등록 — 제적 흔적을 지우고 활성으로 되돌린다.

    UNIQUE 제약 때문에 새 행이 아니라 같은 행의 상태 전이다. ``note`` 는 남긴다
    (왜 뺐다가 되돌렸는지가 이력이다).
    """
    enrollment.status = ENROLLMENT_ACTIVE
    enrollment.withdrawn_at = None
    enrollment.withdrawn_by = None
    await db.commit()
    await db.refresh(enrollment)
    return enrollment
