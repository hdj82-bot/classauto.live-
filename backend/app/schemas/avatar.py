"""아바타 관련 응답 스키마.

``GET /api/avatars`` 와 ``POST /api/avatars/profile-photo`` 가 사용한다.
프론트(아바타 갤러리 페이지·studio 우측 패널)가 1:1 로 소비하는 wire shape.
"""
from typing import Literal

from pydantic import BaseModel, Field


class AvatarMeta(BaseModel):
    """단일 아바타 항목.

    HeyGen 기본 아바타(``is_custom=False``) 와 교수자가 본인 사진으로 만든
    Talking Photo(``is_custom=True``) 를 동일한 shape 로 노출한다. 갤러리가
    ``gender`` 로 남/여 섹션을 나누고, ``preview_video_url`` 로 동적 샘플을
    재생한다.
    """

    avatar_id: str = Field(..., description="HeyGen avatar_id 또는 talking_photo_id.")
    avatar_name: str = Field(..., description="표시 이름.")
    gender: str | None = Field(
        default=None, description='"male" | "female" | null (HeyGen 제공값 그대로).'
    )
    preview_image_url: str | None = Field(
        default=None, description="정적 썸네일 이미지 URL."
    )
    preview_video_url: str | None = Field(
        default=None, description="동적 샘플 영상 URL (hover/클릭 재생용)."
    )
    is_custom: bool = Field(
        default=False,
        description="교수자 본인 사진으로 만든 아바타면 true (목록 맨 앞에 노출).",
    )


class AvatarsResponse(BaseModel):
    """``GET /api/avatars`` 응답."""

    avatars: list[AvatarMeta]
    total: int


class AvatarPreviewRequest(BaseModel):
    """``POST /api/avatars/me/preview`` 요청 본문."""

    voice_id: str | None = Field(
        default=None,
        description="미리보기를 렌더할 ElevenLabs voice_id. null 이면 기본 음성.",
    )
    force: bool = Field(
        default=False,
        description="true 면 캐시를 무시하고 다시 렌더한다(다른 음성으로 재생성 등).",
    )


class AvatarPreviewResponse(BaseModel):
    """본인 아바타 "움직이는 미리보기" 상태.

    Talking Photo 는 정지 사진이라 아이들 영상이 없어, 짧은 샘플을 1회 렌더해
    캐시한다. 프론트는 ``status`` 로 버튼/로딩/재생을 분기한다.
    """

    status: Literal["not_started", "processing", "ready", "failed"] = Field(
        ...,
        description=(
            "'not_started' = 아직 안 만듦, 'processing' = HeyGen 렌더 중, "
            "'ready' = 영상 준비됨(video_url 제공), 'failed' = 렌더 실패."
        ),
    )
    video_url: str | None = Field(
        default=None, description="ready 일 때 재생할 영상 URL(presigned)."
    )
    voice_id: str | None = Field(
        default=None, description="이 미리보기를 렌더한 voice_id."
    )
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")


class ProfilePhotoResponse(BaseModel):
    """``POST /api/avatars/profile-photo`` 응답.

    1차 범위: 사진 업로드 + S3 저장 + HeyGen Talking Photo asset 등록까지.
    실제 강의 영상에 본인 모습을 반영하는 것은 후속 — ``photo_avatar_id`` 가
    채워지면 이후 create_video 에서 사용할 수 있다.
    """

    photo_avatar_id: str | None = Field(
        default=None,
        description="HeyGen Talking Photo ID. 등록 실패·대기 시 null.",
    )
    status: Literal["processing", "ready", "failed"] = Field(
        ...,
        description=(
            "'ready' = talking photo 등록 완료, 'processing' = 업로드는 됐으나 "
            "HeyGen 등록 대기/미연동, 'failed' = HeyGen 등록 실패(사진 저장은 됨)."
        ),
    )
    profile_image_url: str = Field(..., description="업로드된 사진의 S3 https URL.")
    message: str = Field(..., description="사용자 표시용 상태 메시지.")
