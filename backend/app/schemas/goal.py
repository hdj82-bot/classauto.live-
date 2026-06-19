"""학습 목표(LearningGoal) 입출력 스키마 (스펙 11 §H-3)."""
import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalMetric(str, enum.Enum):
    completion_rate = "completionRate"
    attendance_rate = "attendanceRate"
    avg_accuracy = "avgAccuracy"
    qa_count = "qaCount"


class GoalCreate(BaseModel):
    metric: GoalMetric
    label: str = Field(..., min_length=1, max_length=200)
    target_value: float = Field(..., ge=0)


class GoalUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=200)
    target_value: float | None = Field(None, ge=0)


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lecture_id: uuid.UUID
    metric: str
    label: str
    target_value: float
    baseline_value: float | None
    # 계산 필드(현재값·달성률·달성 여부) — 서비스가 채운다.
    current_value: float
    progress_pct: float
    achieved: bool
    created_at: datetime
    updated_at: datetime
