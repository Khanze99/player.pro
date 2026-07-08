import uuid
from datetime import date as date_type

from pydantic import BaseModel

from app.models.enums import AvailabilityStatus


class SquadPlayerOut(BaseModel):
    """Строка экрана Squad Status (раздел 3.2 ТЗ)."""

    athlete_id: uuid.UUID
    name: str
    readiness: int | None
    readiness_zone: str | None
    acwr: float | None
    load_zone: str
    availability: AvailabilityStatus | None
    wellness_filled: bool
    active_injury: bool
    hr_flag: bool


class SquadStatusOut(BaseModel):
    team_id: uuid.UUID
    date: date_type
    players: list[SquadPlayerOut]
