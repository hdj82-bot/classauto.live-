"""PhotoAvatarLook 모델 — 교수자 Photo Avatar(Design with AI)로 생성한 룩 1개."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
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
    # v0.2: 룩 식별은 내부 id(uuid). heygen_look_id 는 provider="heygen"(레거시) 에서만
    # 채워지므로 nullable. gpt 경로는 image_url(S3) 로 룩을 보관하고, 렌더용 아바타는
    # 룩 확정 시 user.photo_avatar_id(talking_photo) 로 등록한다.
    heygen_look_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # v0.2: gpt-image-2 가 생성한 룩 이미지의 S3 저장 URL(영구). OpenAI 결과 URL 은
    # 만료되므로 생성 직후 S3 로 옮겨 이 컬럼에 저장한다.
    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    preview_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 교수자가 라이브러리에서 직접 붙인 룩 이름(연필 아이콘). NULL 이면 프론트가
    # 폴백 라벨("이름 없는 룩")을 표시한다. 영어 prompt 를 표시명으로 쓰던 것을 대체.
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # "generating"|"ready"|"failed" — LookStatus 값을 문자열로 저장(enum 타입 미사용).
    status: Mapped[str] = mapped_column(
        String(20), default=LookStatus.generating.value, nullable=False
    )
    # 온보딩에서 생성한 룩은 "후보"이고, 사용자가 ⋮ 메뉴로 '라이브러리에 저장'하거나
    # 기본 룩으로 지정(확정)한 룩만 saved_to_library=true 가 되어 라이브러리에 노출된다.
    saved_to_library: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
