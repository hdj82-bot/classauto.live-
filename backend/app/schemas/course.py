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
    description: str | None
    instructor_id: uuid.UUID
    is_published: bool
    created_at: datetime
    updated_at: datetime
