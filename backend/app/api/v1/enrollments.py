"""수강 등록 API — 스펙 15 1단계.

학생이 강좌 QR·강의 링크로 들어왔을 때 **등록을 만드는 전용 진입점**이다. 세션 시작
(`POST /api/v1/sessions`)은 여기를 통과한 학생만 허용한다 — 세션 시작 시점에 등록을
슬그머니 만들면 "lecture_id 만 알면 아무나 시작한다"는 구멍이 그대로 남는다.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_student
from app.core.config import settings
from app.db.session import get_db
from app.models.enrollment import ENROLLMENT_ACTIVE
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
    from sqlalchemy import select

    from app.models.enrollment import Enrollment

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
