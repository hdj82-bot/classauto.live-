import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class CourseUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_published: bool | None = None


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    # Course QR 이 여는 학생 진입 주소(`/c/[slug]`). 교수자 화면이 QR 을 그리려면
    # 강좌 목록 응답에 들어 있어야 한다(스펙 15 2단계).
    slug: str
    description: str | None
    instructor_id: uuid.UUID
    is_published: bool
    created_at: datetime
    updated_at: datetime
