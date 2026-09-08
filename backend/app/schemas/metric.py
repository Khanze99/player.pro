import uuid
from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel

from app.models.enums import StreakType


class DailyMetricOut(BaseModel):
    model_config = {"from_attributes": True}

    athlete_id: uuid.UUID
    date: date_type
    daily_load: float
    ewma_acute: float | None
    ewma_chronic: float | None
    acwr: float | None
    load_zone: str
    readiness: int | None
    readiness_zone: str | None
    hr_flag: bool
    unavailable_flag: bool


class StreakOut(BaseModel):
    model_config = {"from_attributes": True}

    type: StreakType
    count: int
    last_date: date_type | None


class RecalcDispatchOut(BaseModel):
    """Ответ на постановку ручного пересчёта в очередь."""

    task_id: str
    status: Literal["queued"] = "queued"


class RecalcStatusOut(BaseModel):
    """Статус ранее поставленной задачи пересчёта."""

    task_id: str
    state: str  # PENDING | STARTED | SUCCESS | FAILURE (как у Celery)
    recalculated_days: int | None = None
    skipped: bool = False
    error: str | None = None
