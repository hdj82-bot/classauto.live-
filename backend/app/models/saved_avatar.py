"""SavedAvatar 모델 — 교수자가 확정한 '룩 + 음성' 조합 아바타 1개."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedAvatar(Base):
    """교수자가 '룩 + 음성'을 골라 저장한 재사용 가능한 아바타 1개.

    photo_avatar_looks(룩)와 cloned_voice/샘플 보이스(음성)를 한 묶음으로 굳혀,
    재방문 시 재선택·재렌더 없이 바로 강의에 적용하도록 한다. 말하는 미리보기
    영상은 user 단일 캐시(``users.photo_avatar_preview_url``)와 달리 이 행에 개별
    보관해 덮어쓰기 없이 갤러리에서 재생한다(룩만 저장하던 라이브러리의 상위 개념).
    """
    __tablename__ = "saved_avatars"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 표시 이름(교수자 지정). 룩 이름과 별개로 조합 단위 라벨.
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # 렌더용 룩 식별자 — photo_avatar_looks.id(gpt 내부 uuid 문자열) 또는
    # heygen_look_id(레거시). create_video 의 avatar character / talking photo 로 통용.
    look_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # 음성 — ElevenLabs/샘플 voice_id. NULL = 성별 기준 기본 보이스.
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 프레임 내 아바타 크기 배율(lecture.avatar_scale 과 동일 의미). 기본 1.0.
    avatar_scale: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0, server_default="1.0"
    )
    # 이 조합 전용 '말하는 미리보기' 캐시(덮어쓰기 없음 — 이 기능의 핵심).
    #  preview_video_url: 완성 영상의 영구 S3 https URL(있으면 ready).
    #  preview_video_id:  렌더 진행 중인 HeyGen video_id(폴링 키).
    #  preview_voice_id / preview_text: 캐시가 현재 음성·대본과 일치하는지 판정용.
    preview_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    preview_video_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preview_voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preview_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
