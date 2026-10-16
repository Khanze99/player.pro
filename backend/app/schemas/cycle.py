"""Минимальный трекинг цикла (решение 2026-10-16): только отметка дня и болевой
порог. Фаза, прогноз, аменорея и детальные симптомы убраны из кода целиком."""

import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field


class CycleSettingsIn(BaseModel):
    tracking_enabled: bool | None = None
    average_cycle_length: int | None = Field(default=None, ge=21, le=45)
    average_period_length: int | None = Field(default=None, ge=1, le=10)


class CycleSettingsOut(BaseModel):
    model_config = {"from_attributes": True}

    tracking_enabled: bool
    average_cycle_length: int
    average_period_length: int


class CycleLogIn(BaseModel):
    date: date_type
    on_period: bool = False
    pain_level: int | None = Field(default=None, ge=0, le=10)


class CycleLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    date: date_type
    on_period: bool
    pain_level: int | None


class CycleStaffOut(BaseModel):
    """Единая витрина для coach и medic — скрывать детализацию больше не от чего,
    согласие (`ensure_can_view_sensitive`) решает, видно ли это вообще."""

    athlete_id: uuid.UUID
    date: date_type
    on_period: bool
    pain_level: int | None
