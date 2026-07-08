import uuid
from datetime import date as date_type

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
