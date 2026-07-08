import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field


class RpeCreateIn(BaseModel):
    date: date_type
    exertion: int = Field(ge=1, le=10)  # CR10 Борг
    performance: int = Field(ge=1, le=5)
    duration_min: int = Field(ge=1, le=600)
    event_id: uuid.UUID | None = None


class RpeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    athlete_id: uuid.UUID
    event_id: uuid.UUID | None
    date: date_type
    exertion: int
    performance: int
    duration_min: int
    session_load: int
    is_late: bool


class RpeCreateOut(BaseModel):
    entry: RpeOut
    streak: int
