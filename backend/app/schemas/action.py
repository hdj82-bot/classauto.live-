"""교수자 개입 행동(InstructorAction) 입출력 스키마 (스펙 11 §H-4)."""
import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ActionType(str, enum.Enum):
    encouragement = "encouragement"
    adopt_recommendation = "adopt_recommendation"
    note = "note"


class ActionCreate(BaseModel):
    action_type: ActionType
    target_user_id: uuid.UUID | None = None
    message: str | None = Field(None, max_length=2000)


class ActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lecture_id: uuid.UUID
    instructor_id: uuid.UUID
    action_type: str
    target_user_id: uuid.UUID | None
    # 대상 학습자 표시명(서비스가 조인해 채운다). 학급 전체 행동이면 None.
    target_name: str | None = None
    message: str | None
    status: str
    created_at: datetime
