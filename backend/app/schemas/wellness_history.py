import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class WellnessValuesOut(BaseModel):
    """Сырые шкалы 1–10; дробные значения допустимы у командного среднего."""

    sleep_quality: float = Field(ge=1, le=10)
    energy: float = Field(ge=1, le=10)
    soreness: float = Field(ge=1, le=10)
    stress: float = Field(ge=1, le=10)
    mood: float = Field(ge=1, le=10)


class WellnessTeamAverageOut(BaseModel):
    values: WellnessValuesOut
    count: int = Field(ge=1)


class WellnessHistoryEventOut(BaseModel):
    id: uuid.UUID
    date: date_type
    type: Literal["training", "match"]
    title: str | None
    planned_start: datetime


class WellnessHistoryDayOut(BaseModel):
    date: date_type
    submitted_at: datetime | None
    values: WellnessValuesOut | None
    team_average: WellnessTeamAverageOut | None
    events: list[WellnessHistoryEventOut]


class WellnessHistoryCycleOut(BaseModel):
    """Только явно отмеченные дни; без боли, фаз и прогнозов."""

    period_days: list[date_type]


class WellnessHistoryOut(BaseModel):
    athlete_id: uuid.UUID
    team_id: uuid.UUID
    timezone: str
    today: date_type
    date_from: date_type
    date_to: date_type
    context_from: date_type
    days: list[WellnessHistoryDayOut]
    games: list[WellnessHistoryEventOut]
    cycle: WellnessHistoryCycleOut | None = None
