"""Subscription 모델 (app/ subscription 흡수)."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlanType(str, enum.Enum):
    free = "FREE"
    basic = "BASIC"
    pro = "PRO"


PLAN_LIMITS: dict[str, int] = {
    "FREE": 2,
    "BASIC": 10,
    "PRO": 20,
}


class Subscription(Base):
    """사용자 구독 플랜 관리."""
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    plan: Mapped[PlanType] = mapped_column(
        SAEnum(PlanType), nullable=False, default=PlanType.free
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def monthly_limit(self) -> int:
        return PLAN_LIMITS.get(self.plan.value, 2)
