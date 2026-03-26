import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LectureCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int = Field(default=0, ge=0)
    expires_at: datetime | None = None


class LectureUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int | None = Field(None, ge=0)
    expires_at: datetime | None = None
    is_published: bool | None = None


class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    video_url: str | None
    thumbnail_url: str | None
    slug: str
    order: int
    expires_at: datetime | None
    is_published: bool
    created_at: datetime
    updated_at: datetime


class LecturePublicResponse(BaseModel):
    """시청 만료 여부에 따라 video_url을 숨기는 공개 응답."""

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    thumbnail_url: str | None
    slug: str
    is_expired: bool
    # 만료된 경우 None 반환
    video_url: str | None
