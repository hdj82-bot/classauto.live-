"""InstructorAction 모델 — 교수자 개입 행동 로그 (스펙 11 §H-4 / 10번 G3, RQ2).

"교수자가 데이터로 대면 수업·학습자 관리를 바꾼 행동"을 포착하는 RQ2 핵심 계측
테이블. 격려 메시지 발송·권고 채택·메모 등을 기록한다. 실제 외부 발송(이메일/알림)
채널은 후속 — 본 테이블은 '행동이 일어났다'는 사실과 내용을 남긴다.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class InstructorAction(Base):
    """교수자가 취한 개입 행동 1건."""

    __tablename__ = "instructor_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 행동 유형 — schema ActionType enum 으로 검증
    # (encouragement / adopt_recommendation / note). DB 는 문자열 저장.
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # 대상 학습자(격려 등). 학급 전체 행동이면 NULL.
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 실제 외부 발송 연결 전까지는 'recorded'(기록만). 발송 채널 도입 시 'sent' 등.
    status: Mapped[str] = mapped_column(String(20), default="recorded", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    target_user = relationship("User", foreign_keys=[target_user_id])
