"""StandardAvatar 모델 — 교수자가 HeyGen 웹 스튜디오에서 만든 표준 Video Avatar.

Pay-As-You-Go(자가 결제) 등급에서는 커스텀 Video Avatar(Digital Twin)를 API 로
"생성"할 수 없다. 대신 웹 스튜디오에서 본인 영상으로 Video Avatar 를 1회 만든 뒤,
그 ``avatar_id`` 를 여기에 등록해 두면 갤러리에서 골라 강의에 적용할 수 있다.
렌더 시 HeyGen 은 이 avatar_id 를 ``character.type="avatar"`` 로 사용한다
(qa_batch._resolve_character — 본인 photo avatar 가 아니면 표준 avatar 로 분기).

Photo Avatar(Talking Photo, 몸 고정·얼굴만 움직임)와 달리 전신이 자연스럽게
움직이는 표준 아바타로, 동일 분당 단가($1/분)에서 기괴함을 줄이는 비교 대상이다.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StandardAvatar(Base):
    """교수자가 등록한 표준 HeyGen Video Avatar 1개.

    ``heygen_avatar_id`` 는 HeyGen ``/v2/avatars`` 의 avatar_id 로, 강의에
    적용하면 그대로 ``lecture.avatar_id`` 에 저장돼 렌더 character 로 쓰인다.
    등록 시 HeyGen 메타데이터(미리보기 이미지·영상·성별)를 함께 보관해
    갤러리가 재호출 없이 썸네일·샘플 영상을 보여 준다.
    """
    __tablename__ = "standard_avatars"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # HeyGen /v2/avatars 의 avatar_id. 강의 적용 시 lecture.avatar_id 로 그대로 통용.
    heygen_avatar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # 교수자가 직접 붙인 표시 이름(연필). NULL 이면 프론트가 HeyGen 이름/폴백을 표시.
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # 등록 시점 HeyGen 메타데이터(영구 외부 URL — presign 대상 아님).
    preview_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    preview_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # "male" | "female" | null (HeyGen 제공값 그대로). 음성 기본값 추론 등에 참고.
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
