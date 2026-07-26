import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils.slug import slugify


def _course_slug(title: str | None) -> str:
    """제목에서 강좌 slug 를 만든다. 마이그레이션 `0077` 의 백필과 같은 규칙이다.

    제목이 기호뿐이면 `slugify` 는 접미사만 남은 `-a1b2c3d4` 를 돌려준다. 앞이 하이픈인
    주소는 링크로 붙여넣을 때 잘리기 쉬워서 `course-` 를 앞에 세운다.
    """
    slug = slugify(title or "")
    return f"course{slug}" if slug.startswith("-") else slug


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # Course 단위 학생 진입 `/c/[slug]` 의 주소(스펙 15 2단계). `lectures.slug` 와 같은
    # 규칙(utils.slug.slugify — 제목 + UUID 8자리 접미사)이라 충돌이 사실상 없다.
    # 학기 초 QR 1회로 끝내려면 강의가 아니라 **강좌**에 안정적인 주소가 있어야 한다.
    #
    # 부여는 **모델이 책임진다**. slug 없는 강좌는 학생이 도달할 수 없는 강좌이므로
    # 생성 경로(서비스·시드·테스트·나중의 일괄 등록)마다 챙기게 두면 언젠가 빠진다.
    slug: Mapped[str] = mapped_column(
        String(300),
        unique=True,
        nullable=False,
        index=True,
        default=lambda ctx: _course_slug(ctx.get_current_parameters().get("title")),
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 학기 라벨(예: "2026-2"). NULL = 미지정. 이게 없으면 2027-1 에 같은 과목을 다시
    # 열 때 지난 학기 수강생과 섞인다(스펙 15 §1.4). 기존 행은 NULL 로 두었다 —
    # 어느 학기였는지 알 방법이 없고, 추정해 넣으면 틀린 값이 사실처럼 굳는다.
    term: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    instructor = relationship("User", backref="courses")
    lectures = relationship(
        "Lecture",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Lecture.order",
    )
