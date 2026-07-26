from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_current_user_optional,
    require_professor,
)
from app.db.session import get_db
from app.models.course import Course
from app.models.lecture import Lecture
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


# ── 스펙 15 2단계: Course 단위 학생 진입 `/c/[slug]` ──────────────────────────


@router.get(
    "/public/{slug}",
    summary="공개 강좌 정보 + 발행 강의 목록 (학생 진입용, 인증 불필요)",
)
async def get_public_course(
    slug: str,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
):
    """`/c/[slug]` 가 여는 화면의 데이터.

    학기 초 QR 1회로 끝내기 위한 **강좌 단위** 진입점이다(스펙 15 §1.1). 종전
    `/v/[slug]` 는 강의 단위라 12주차면 링크·QR 이 12개였다.

    인증 없이 연다 — 학생이 로그인하기 **전에** "무슨 강좌인지" 보고 판단해야 한다.
    등록은 로그인 후 별도 호출(`POST /api/v1/enrollments/join`)이며, 이 응답에는
    개인정보가 없다(강좌 제목·교수자 이름·발행 강의 제목까지).

    발행되지 않은 강의는 목록에서 제외한다. 만료된 강의는 `is_expired` 로 표시하되
    목록에는 남긴다 — 사라지면 학생이 "내 강의가 없어졌다"고 문의한다.

    **인증은 선택**이다(`get_current_user_optional`). 토큰이 있으면 `is_owner` 를
    채워 주는데, 교수자가 QR 을 학생에게 띄우기 전에 **본인이 먼저 스캔해 보는**
    미리보기에 쓰인다. 소유자여도 보이는 목록은 학생과 동일하다 — 미발행 강의를
    끼워 주면 "학생에게 이렇게 보입니다"가 거짓말이 된다.
    """
    now = datetime.now(timezone.utc)

    row = (
        await db.execute(
            select(Course, User.name)
            .outerjoin(User, Course.instructor_id == User.id)
            .where(Course.slug == slug)
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강좌를 찾을 수 없습니다."
        )

    course, instructor_name = row

    lectures = (
        (
            await db.execute(
                select(Lecture)
                .where(Lecture.course_id == course.id, Lecture.is_published.is_(True))
                .order_by(Lecture.order, Lecture.created_at)
            )
        )
        .scalars()
        .all()
    )

    def _expired(lec: Lecture) -> bool:
        if lec.expires_at is None:
            return False
        expires = lec.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires < now

    items = [
        {
            "id": str(lec.id),
            "slug": lec.slug,
            "title": lec.title,
            "description": lec.description,
            "thumbnail_url": lec.thumbnail_url,
            "order": lec.order,
            "is_expired": _expired(lec),
        }
        for lec in lectures
    ]

    return {
        "id": str(course.id),
        "slug": course.slug,
        "title": course.title,
        "description": course.description,
        "term": course.term,
        "instructor_name": instructor_name,
        "lecture_count": len(items),
        # 발행 강의가 전부 만료면 강좌 자체가 끝난 것으로 본다 —
        # `courses` 에는 만료 컬럼이 없어 강의 만료에서 파생한다.
        "is_expired": bool(items) and all(i["is_expired"] for i in items),
        # 소유 교수자 여부. 미리보기에서 "스튜디오로 열기"를 붙일지만 정한다 —
        # 미리보기 자체는 학생이 아닌 로그인 사용자 전부에게 적용된다.
        "is_owner": viewer is not None and viewer.id == course.instructor_id,
        "lectures": items,
    }
