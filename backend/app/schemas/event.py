import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AttendanceStatus, EventType


class EventCreateIn(BaseModel):
    team_id: uuid.UUID | None = None  # None — индивидуальное событие игрока
    type: EventType
    title: str | None = Field(default=None, max_length=255)
    planned_start: datetime
    planned_duration_min: int = Field(ge=1, le=600)
    location_id: uuid.UUID | None = None


class EventUpdateIn(BaseModel):
    type: EventType | None = None
    title: str | None = None
    planned_start: datetime | None = None
    planned_duration_min: int | None = Field(default=None, ge=1, le=600)
    location_id: uuid.UUID | None = None


class EventOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    team_id: uuid.UUID | None
    type: EventType
    title: str | None
    planned_start: datetime
    planned_duration_min: int
    location_id: uuid.UUID | None
    created_by: uuid.UUID


class AttendanceIn(BaseModel):
    user_id: uuid.UUID
    status: AttendanceStatus


class AttendanceOut(BaseModel):
    model_config = {"from_attributes": True}

    event_id: uuid.UUID
    user_id: uuid.UUID
    status: AttendanceStatus
