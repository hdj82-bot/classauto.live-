"""IFL HeyGen — Subscription 모델."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# 플랜별 월간 렌더링 한도
PLAN_LIMITS: dict[str, int] = {
    "FREE": 2,
    "BASIC": 10,
    "PRO": 20,
}


class Subscription(Base):
    """사용자 구독 플랜 관리 테이블."""

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(
        Enum("FREE", "BASIC", "PRO", name="subscription_plan"),
        nullable=False,
        default="FREE",
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def monthly_limit(self) -> int:
        return PLAN_LIMITS.get(self.plan, 2)
