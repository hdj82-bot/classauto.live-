"""BetaApplication 모델 — 대문 '베타 신청하기' 폼 제출 보관.

베타 신청은 흩어진 이메일 대신 운영자 콘솔(/admin) 수신함으로 모은다. 신청자는
아직 가입 전이라 user FK 없이 폼 입력값(스냅샷)만 저장한다. 운영자(ADMIN_EMAILS,
예: hdj82@kyonggi.ac.kr)가 콘솔에서 검토·상태 변경한다.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BetaApplication(Base):
    __tablename__ = "beta_applications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    school: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str] = mapped_column(String(200), nullable=False)
    professor_title: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    # 학생 수(대략) — 선택 입력. 폼이 문자열로 보내므로 그대로 스냅샷 보관.
    student_count: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # "now" | "nextSemester" | "undecided".
    start_timing: Mapped[str] = mapped_column(String(20), nullable=False)
    # "referral" | "conference" | "search" | "other".
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "new" | "contacted" | "approved" | "rejected".
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new", server_default="new"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
