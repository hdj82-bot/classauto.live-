"""수강 등록 API — 스펙 15 1단계.

학생이 강좌 QR·강의 링크로 들어왔을 때 **등록을 만드는 전용 진입점**이다. 세션 시작
(`POST /api/v1/sessions`)은 여기를 통과한 학생만 허용한다 — 세션 시작 시점에 등록을
슬그머니 만들면 "lecture_id 만 알면 아무나 시작한다"는 구멍이 그대로 남는다.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor, require_student
from app.core.config import settings
from app.db.session import get_db
from app.models.course import Course
from app.models.enrollment import ENROLLMENT_ACTIVE, Enrollment
from app.models.lecture import Lecture
from app.models.session import LearningSession
from app.models.user import User
from app.services import enrollment as enrollment_svc

router = APIRouter(prefix="/api/v1/enrollments", tags=["enrollments"])

# 학생에게 보이는 문구는 취할 행동이 달라 구분한다 — 미등록은 링크를 확인하라는
# 뜻이고, 제적은 교수에게 문의하라는 뜻이다.
WITHDRAWN_DETAIL = "이 강좌에서 수강이 종료되었습니다. 담당 교수님께 문의하세요."
NOT_ENROLLED_DETAIL = "이 강좌에 등록되지 않았습니다. 담당 교수님이 안내한 링크로 다시 들어와 주세요."


class JoinRequest(BaseModel):
    """`/c/[slug]` 는 course_slug, `/v/[slug]` 는 lecture_slug 로 들어온다."""

    course_slug: str | None = None
    lecture_slug: str | None = None

    @model_validator(mode="after")
    def _one_of(self):
        if not self.course_slug and not self.lecture_slug:
            raise ValueError("course_slug 또는 lecture_slug 중 하나는 필요합니다.")
        return self


class EnrollmentResponse(BaseModel):
    id: str
    course_id: str
    status: str
    section: str | None = None
    source: str


@router.post(
    "/join",
    response_model=EnrollmentResponse,
    summary="강좌 수강 등록 (학생)",
)
async def join(
    body: JoinRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
):
    """강좌에 등록한다. **멱등** — 이미 등록돼 있으면 그대로 반환한다.

    제적된 학생은 403. 자동 복구하면 제적이 무의미해지므로 재등록은 교수자만 할 수 있다.
    """
    course_id = await enrollment_svc.resolve_course_id(
        db, course_slug=body.course_slug, lecture_slug=body.lecture_slug
    )
    if course_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="강좌를 찾을 수 없습니다.",
        )

    try:
        enrollment = await enrollment_svc.join_course(db, course_id, student.id)
    except enrollment_svc.WithdrawnFromCourse:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=WITHDRAWN_DETAIL
        )

    return EnrollmentResponse(
        id=str(enrollment.id),
        course_id=str(enrollment.course_id),
        status=enrollment.status,
        section=enrollment.section,
        source=enrollment.source,
    )


@router.get(
    "/me",
    response_model=list[EnrollmentResponse],
    summary="내 수강 등록 목록 (학생)",
)
async def my_enrollments(
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
):
    """학생 본인의 등록 목록. 제적 건도 포함해 상태로 구분한다."""
    rows = (
        await db.execute(
            select(Enrollment)
            .where(Enrollment.student_id == student.id)
            .order_by(Enrollment.joined_at.desc())
        )
    ).scalars().all()
    return [
        EnrollmentResponse(
            id=str(e.id),
            course_id=str(e.course_id),
            status=e.status,
            section=e.section,
            source=e.source,
        )
        for e in rows
    ]


# ── 명단 (교수자) — 스펙 15 2단계 ────────────────────────────────────────────


class RosterEntry(BaseModel):
    """명단 한 줄. 교수자가 "누가 내 학생인가"를 실제로 볼 수 있게 하는 최소 집합."""

    enrollment_id: str
    student_id: str
    name: str | None
    student_number: str | None
    status: str
    section: str | None
    source: str
    joined_at: datetime
    # 이 강좌의 강의 중 마지막으로 본 시각. NULL = 등록만 하고 한 번도 안 봤다.
    # 종전에는 이런 학생이 어디에도 나타나지 않았다(스펙 15 §1.2 — 분모가 없었다).
    last_watched_at: datetime | None


class RosterResponse(BaseModel):
    course_id: str
    course_title: str
    active_count: int
    withdrawn_count: int
    # 등록만 하고 한 번도 시청하지 않은 활성 학생 수 — 명단이 생기며 처음 셀 수 있게 된 값.
    never_watched_count: int
    entries: list[RosterEntry]


async def _course_owned_by(
    db: AsyncSession, course_id: uuid.UUID, professor: User
) -> Course:
    """소유권 가드. 남의 강좌 명단은 학생 개인정보라 존재 여부도 알려주지 않는다."""
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one_or_none()
    if course is None or course.instructor_id != professor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강좌를 찾을 수 없습니다."
        )
    return course


@router.get(
    "/roster/{course_id}",
    response_model=RosterResponse,
    summary="강좌 수강 명단 (교수자)",
)
async def get_roster(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """강좌의 등록 학생 명단. 제적자도 포함해 상태로 구분한다.

    제적자를 빼면 "그 학생 어디 갔지"를 확인할 방법이 사라진다 — 행을 지우지 않는
    이유(스펙 15 §3.1)와 같은 이유로 명단에서도 지우지 않는다.

    `last_watched_at` 은 이 강좌의 강의 세션에서 파생한다. 등록만 하고 한 번도 안 본
    학생이 NULL 로 드러나는 것이 이 화면의 핵심이다 — 종전에는 세션 행이 없으면
    존재 자체가 보이지 않았다(§1.2).
    """
    course = await _course_owned_by(db, course_id, professor)

    # 학생별 마지막 시청 시각을 한 번의 집계로 뽑는다(명단 행마다 조회하면 N+1).
    # 세션 시각은 last_active_at 이 가장 정확하지만 초기 이탈 세션은 비어 있을 수
    # 있어 started_at → created_at 순으로 떨어뜨린다.
    watched_at = func.max(
        func.coalesce(
            LearningSession.last_active_at,
            LearningSession.started_at,
            LearningSession.created_at,
        )
    )
    last_watch_rows = (
        await db.execute(
            select(LearningSession.user_id, watched_at)
            .join(Lecture, Lecture.id == LearningSession.lecture_id)
            .where(Lecture.course_id == course_id)
            .group_by(LearningSession.user_id)
        )
    ).all()
    last_watch = {row[0]: row[1] for row in last_watch_rows}

    rows = (
        await db.execute(
            select(Enrollment, User)
            .join(User, User.id == Enrollment.student_id)
            .where(Enrollment.course_id == course_id)
            # 활성이 먼저, 그 안에서는 먼저 등록한 순 — 학기 초 스캔 순서 그대로다.
            .order_by(Enrollment.status, Enrollment.joined_at)
        )
    ).all()

    entries = [
        RosterEntry(
            enrollment_id=str(e.id),
            student_id=str(u.id),
            name=u.name,
            student_number=u.student_number,
            status=e.status,
            section=e.section,
            source=e.source,
            joined_at=e.joined_at,
            last_watched_at=last_watch.get(u.id),
        )
        for e, u in rows
    ]

    active = [x for x in entries if x.status == ENROLLMENT_ACTIVE]
    return RosterResponse(
        course_id=str(course.id),
        course_title=course.title,
        active_count=len(active),
        withdrawn_count=len(entries) - len(active),
        never_watched_count=sum(1 for x in active if x.last_watched_at is None),
        entries=entries,
    )


class WithdrawRequest(BaseModel):
    note: str | None = None


@router.post(
    "/{enrollment_id}/withdraw",
    response_model=RosterEntry,
    summary="수강 제적 (교수자)",
)
async def withdraw_enrollment(
    enrollment_id: uuid.UUID,
    body: WithdrawRequest | None = None,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """제적 — **행을 지우지 않고** ``status='withdrawn'`` 으로 바꾼다(스펙 15 §3.1).

    지우면 이미 쌓인 세션·평가 결과가 주인을 잃고 연구 데이터의 코호트 집계가 과거와
    어긋난다. 중도 이탈 이력 자체가 연구 대상이기도 하다.
    """
    enrollment = (
        await db.execute(select(Enrollment).where(Enrollment.id == enrollment_id))
    ).scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="등록을 찾을 수 없습니다."
        )
    await _course_owned_by(db, enrollment.course_id, professor)

    await enrollment_svc.withdraw(
        db, enrollment, withdrawn_by=professor.id, note=body.note if body else None
    )
    return await _entry_for(db, enrollment)


@router.post(
    "/{enrollment_id}/reactivate",
    response_model=RosterEntry,
    summary="수강 재등록 (교수자)",
)
async def reactivate_enrollment(
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """제적 취소. 제적된 학생은 스스로 복구할 수 없으므로(§4.2) 되돌리는 경로가
    화면에 없으면 오조작 한 번이 그 학생을 학기 내내 잠근다.

    ``UNIQUE(course_id, student_id)`` 때문에 새 행이 아니라 같은 행의 상태 전이다 —
    ``note`` 는 남긴다(왜 뺐다가 되돌렸는지가 이력이다).
    """
    enrollment = (
        await db.execute(select(Enrollment).where(Enrollment.id == enrollment_id))
    ).scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="등록을 찾을 수 없습니다."
        )
    await _course_owned_by(db, enrollment.course_id, professor)

    await enrollment_svc.reactivate(db, enrollment)
    return await _entry_for(db, enrollment)


async def _entry_for(db: AsyncSession, enrollment: Enrollment) -> RosterEntry:
    """쓰기 응답용 한 줄. 프론트가 목록 전체를 다시 받지 않고 그 행만 갱신한다.

    `last_watched_at` 을 비워 두면 프론트가 그 행의 시청 이력을 지운 것처럼 덮어써서,
    제적 버튼을 누른 순간 "한 번도 안 봄"으로 바뀐다. 한 줄이니 다시 계산한다.
    """
    student = (
        await db.execute(select(User).where(User.id == enrollment.student_id))
    ).scalar_one()
    last_watched = (
        await db.execute(
            select(
                func.max(
                    func.coalesce(
                        LearningSession.last_active_at,
                        LearningSession.started_at,
                        LearningSession.created_at,
                    )
                )
            )
            .join(Lecture, Lecture.id == LearningSession.lecture_id)
            .where(
                Lecture.course_id == enrollment.course_id,
                LearningSession.user_id == enrollment.student_id,
            )
        )
    ).scalar_one_or_none()
    return RosterEntry(
        enrollment_id=str(enrollment.id),
        student_id=str(student.id),
        name=student.name,
        student_number=student.student_number,
        status=enrollment.status,
        section=enrollment.section,
        source=enrollment.source,
        joined_at=enrollment.joined_at,
        last_watched_at=last_watched,
    )


async def assert_enrolled_for_lecture(
    db: AsyncSession, lecture_id: uuid.UUID, student_id: uuid.UUID
) -> None:
    """세션 시작 게이트 — 강의가 속한 강좌에 활성 등록이 있어야 통과.

    종전에는 `lecture_id`(UUID) 하나만 알면 세션이 시작됐다(스펙 15 §1.3). 이제는
    등록 진입점을 통과한 학생만 시청·퀴즈·질문을 할 수 있고, UUID 가 로그·API 응답·
    공유 화면으로 새어도 그것만으로는 아무것도 못 한다.

    **``settings.ENROLLMENT_GATE_ENABLED`` 뒤에 있다.** 프론트(Vercel)와 백엔드
    (Railway)를 원자적으로 배포할 수 없어, 게이트를 켠 백엔드가 먼저 나가면 아직
    join 을 호출하지 않는 프론트 때문에 모든 학생이 재생 불가가 된다. 배포 순서는
    스펙 15 §11 을 따르고, 롤백은 이 환경변수 하나로 끝난다.
    """
    if not settings.ENROLLMENT_GATE_ENABLED:
        return

    course_id = await enrollment_svc.resolve_course_id(db, lecture_id=lecture_id)
    if course_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강의를 찾을 수 없습니다."
        )

    existing = await enrollment_svc.get_enrollment(db, course_id, student_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ENROLLED_DETAIL
        )
    if existing.status != ENROLLMENT_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=WITHDRAWN_DETAIL
        )
