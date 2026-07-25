import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# 등록 상태. 승인제가 필요해지면 'pending' 을 더하면 같은 모델 위에서 확장된다
# (스펙 15 §5 — 지금은 열린 등록 + 명시적 제적).
ENROLLMENT_ACTIVE = "active"
ENROLLMENT_WITHDRAWN = "withdrawn"

# 등록 경로. 어떤 유입이 실제로 쓰이는지 베타 운영 중 관찰하기 위함.
ENROLLMENT_SOURCE_LINK = "link"
ENROLLMENT_SOURCE_MANUAL = "manual"


class Enrollment(Base):
    """수강 등록 — 교수자(강좌)와 학생을 잇는 관계. 스펙 15.

    이 테이블이 생기기 전에는 "내 학생"이 ``LearningSession → Lecture →
    Course.instructor_id`` 로 **사후 파생**됐다. 그래서 등록만 하고 한 번도 안 본
    학생은 존재 자체가 보이지 않았고(분모가 없어 "미시청 3명"을 특정할 수 없었다),
    출석률 분모가 "본 사람 수"였으며, 학생을 반에서 뺄 방법이 없었다.

    **반의 단위는 Course 다.** 같은 과목의 여러 분반은 같은 영상을 보므로 분반마다
    Course 를 만들지 않는다 — 만들면 영상과 RAG 임베딩을 분반 수만큼 복제해야 하고
    렌더 비용이 배가 된다. 분반은 :attr:`section` 라벨로 구분하고 출석·분석만 필터한다.

    **제적은 행 삭제가 아니라** ``status='withdrawn'`` 이다. 삭제하면 이미 쌓인 세션·
    평가 결과가 주인을 잃고 연구 데이터(스펙 10)의 코호트 집계가 과거와 어긋난다.
    중도 이탈 이력 자체가 연구 대상이기도 하다. ``UNIQUE(course_id, student_id)``
    덕분에 재등록은 새 행이 아니라 같은 행의 상태 전이가 되어 이력이 한 줄에 모인다.
    """

    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "student_id", name="uq_enrollments_course_student"),
        # 명단 조회 핫패스(강좌의 활성 수강생).
        Index("ix_enrollments_course_status", "course_id", "status"),
        # "내가 듣는 강좌" 역방향 + create_session 게이트 조회.
        Index("ix_enrollments_student_id", "student_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ENROLLMENT_ACTIVE, server_default=ENROLLMENT_ACTIVE
    )
    # 분반 라벨(예: "01", "화3"). NULL = 분반 구분 없음. UI 노출은 스펙 15 3단계.
    section: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ENROLLMENT_SOURCE_LINK,
        server_default=ENROLLMENT_SOURCE_LINK,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    withdrawn_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 제적한 교수자. 유저 삭제 시 등록 기록은 남기되 FK 만 비운다(스펙 14 §5 — 쓰기에는
    # 추적이 따라붙는다).
    withdrawn_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # 교수자 메모(제적 사유 등).
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    course = relationship("Course", backref="enrollments")
    student = relationship("User", foreign_keys=[student_id], backref="enrollments")
