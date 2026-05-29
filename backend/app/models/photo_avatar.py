"""PhotoAvatarLook 모델 — 교수자 Photo Avatar(Design with AI)로 생성한 룩 1개."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LookStatus(str, enum.Enum):
    """status 컬럼 값(문자열로 저장). 코드에서 .value 로 비교·기록한다."""
    generating = "generating"
    ready = "ready"
    failed = "failed"


class PhotoAvatarLook(Base):
    """교수자 사진 아바타 그룹에서 생성된 룩(스타일/배경 변형) 1개.

    ``heygen_look_id`` 는 HeyGen 의 룩 id 로, ``/v2/video/generate`` 의 avatar
    character(avatar_id)로 그대로 사용한다. 교수자가 고른 기본 룩은
    ``User.photo_avatar_default_look_id`` 에 그 값이 저장된다.
    """
    __tablename__ = "photo_avatar_looks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    heygen_look_id: Mapped[str] = mapped_column(String(255), nullable=False)
    preview_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "generating"|"ready"|"failed" — LookStatus 값을 문자열로 저장(enum 타입 미사용).
    status: Mapped[str] = mapped_column(
        String(20), default=LookStatus.generating.value, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
