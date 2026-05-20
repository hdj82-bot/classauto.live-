import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    order: int = Field(default=0, ge=0)


class FolderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    order: int | None = Field(None, ge=0)


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instructor_id: uuid.UUID
    name: str
    order: int
    lecture_count: int = 0
    created_at: datetime
    updated_at: datetime


class LectureMoveRequest(BaseModel):
    """강의의 폴더 소속을 변경할 때 사용. ``folder_id=None`` 이면 미분류로 이동."""

    folder_id: uuid.UUID | None = None
