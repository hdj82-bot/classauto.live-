"""AdminAuditLog 모델 (운영자 god-mode 행위 추적용 불변 로그).

역할 변경·유저 삭제·초대 생성/삭제처럼 운영자가 다른 계정에 영향을 주는
행위를 1행씩 남긴다. actor(유저)가 나중에 삭제돼도 추적이 끊기지 않도록
``actor_email`` 을 스냅샷으로 함께 저장한다(FK 는 SET NULL).
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # 행위한 운영자. 유저 삭제 시 기록은 보존하되 FK 만 비운다.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # actor 가 삭제돼도 누가 했는지 남기기 위한 이메일 스냅샷.
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "user.update_role" | "user.delete" | "invite.create" | "invite.delete" 등.
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # "user" | "invite" 등.
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # uuid 또는 email 문자열.
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 변경 전/후, 바뀐 필드 등 부가 정보.
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
