import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VoiceFavorite(Base):
    """교수자별 즐겨찾기 ElevenLabs 보이스.

    ``(user_id, voice_id)`` 복합 PK — 한 보이스를 한 번만 즐겨찾기. 보이스 목록은
    ElevenLabs 외부 카탈로그라 ``voice_id`` 는 FK 가 아닌 문자열로 보관한다.
    GET /api/voices 가 이 테이블을 조회해 ``is_favorite`` 를 채우고, studio 음성
    패널의 "즐겨찾기만" 토글과 /professor/voices 페이지가 이를 사용한다.
    """

    __tablename__ = "voice_favorites"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    voice_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
