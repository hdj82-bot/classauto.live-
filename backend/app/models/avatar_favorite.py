import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AvatarFavorite(Base):
    """교수자별 즐겨찾기 HeyGen 아바타(공개/표준).

    ``(user_id, avatar_id)`` 복합 PK — 한 아바타를 한 번만 즐겨찾기. 아바타 목록은
    HeyGen 외부 카탈로그라 ``avatar_id`` 는 FK 가 아닌 문자열로 보관한다. 공개 아바타
    브라우저(/professor/avatars/browse)의 별표 토글과 "즐겨찾기만 보기"가 사용한다
    (voice_favorites 의 아바타 버전).
    """

    __tablename__ = "avatar_favorites"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    avatar_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
