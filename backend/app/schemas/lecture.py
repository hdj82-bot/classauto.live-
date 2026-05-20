import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.lecture import VoiceGender


class LectureCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int = Field(default=0, ge=0)
    expires_at: datetime | None = None
    voice_gender: VoiceGender = Field(
        default=VoiceGender.male,
        description="HeyGen 아바타·ElevenLabs 보이스 성별. 'male' | 'female'. 기본 male.",
    )


class LectureUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int | None = Field(None, ge=0)
    expires_at: datetime | None = None
    is_published: bool | None = None
    voice_gender: VoiceGender | None = Field(
        default=None,
        description="변경 시 다음 렌더부터 적용. 기존 렌더된 영상은 재생성 전까지 유지.",
    )


class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    folder_id: uuid.UUID | None = None
    title: str
    description: str | None
    video_url: str | None
    thumbnail_url: str | None
    slug: str
    order: int
    expires_at: datetime | None
    is_published: bool
    voice_gender: VoiceGender
    created_at: datetime
    updated_at: datetime


class LecturePublicResponse(BaseModel):
    """시청 만료 여부에 따라 video_url을 숨기는 공개 응답.

    BACKEND_ASKS.W4 #1·#2: ``/v/[slug]`` 학생 진입 페이지가 "○○○ 교수님이 보낸
    강의입니다" / 강좌명 / mm:ss 길이 표시를 위해 다음 세 필드를 추가로 노출.
    데이터가 없으면 ``None`` — 기존 호출자는 키 무시로 동작 호환 유지.
    """

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    thumbnail_url: str | None
    slug: str
    is_expired: bool
    # 만료된 경우 None 반환
    video_url: str | None

    # ── R2W2: 학생 진입 화면용 부가 정보 (모두 Optional) ────────────────
    professor_name: str | None = Field(
        default=None,
        description="강좌 소유 교수자의 표시명 (course → instructor.name).",
        examples=["하두진"],
    )
    course_name: str | None = Field(
        default=None,
        description="이 강의가 속한 강좌의 제목 (course.title).",
        examples=["현대중국사회의이해"],
    )
    duration_sec: int | None = Field(
        default=None,
        description=(
            "강의에 연결된 최신 Video.duration_seconds. 영상이 아직 렌더되지 "
            "않았거나 길이 메타가 없으면 None."
        ),
        examples=[312],
    )
