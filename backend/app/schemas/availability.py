import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.availability import Direction
from app.models.enums import AvailabilityStatus


class AvailabilitySetIn(BaseModel):
    athlete_id: uuid.UUID
    date: date_type
    status: AvailabilityStatus


class AvailabilityOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    athlete_id: uuid.UUID
    date: date_type
    status: AvailabilityStatus
    set_by: uuid.UUID


class AvailabilitySummaryOut(BaseModel):
    """Разбивка за 90 дней (раздел 6.5 ТЗ)."""

    athlete_id: uuid.UUID
    window_days: int
    full_days: int
    modified_days: int
    unavailable_days: int
    availability_percent: float | None  # None — нет данных
    tracked_days: int = 0


class AvailabilityChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    athlete_id: uuid.UUID
    direction: Direction
    date: date_type
    status: AvailabilityStatus
    comment: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    medical_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    expected_version: int = Field(ge=0)
    request_id: uuid.UUID


class AvailabilityChangeOut(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    direction: Direction
    date: date_type
    status: AvailabilityStatus
    actor_id: uuid.UUID
    actor_name: str
    actor_role: str
    comment: str | None
    source: str
    version: int
    created_at: datetime


class AvailabilityDirectionOut(BaseModel):
    status: AvailabilityStatus
    effective_from: date_type
    source: Literal["default", "manual", "legacy"]
    change: AvailabilityChangeOut | None = None


class AvailabilityStateOut(BaseModel):
    athlete_id: uuid.UUID
    today: date_type
    start_date: date_type | None
    status: AvailabilityStatus | None
    medical: AvailabilityDirectionOut | None
    coaching: AvailabilityDirectionOut | None
    version: int
    editable_directions: list[Direction]
    can_view_details: bool
    summary: AvailabilitySummaryOut


class AvailabilityChangePage(BaseModel):
    items: list[AvailabilityChangeOut]
    total: int
    page: int
    size: int


class AvailabilityMedicalNoteOut(BaseModel):
    change_id: uuid.UUID
    date: date_type
    medical_note: str


class AvailabilityMedicalNotePage(BaseModel):
    current: AvailabilityMedicalNoteOut | None = None
    items: list[AvailabilityMedicalNoteOut]
    total: int
    page: int
    size: int


class AvailabilitySavedOut(BaseModel):
    change: AvailabilityChangeOut
    state: AvailabilityStateOut
