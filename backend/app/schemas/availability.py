import uuid
from datetime import date as date_type

from pydantic import BaseModel

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
