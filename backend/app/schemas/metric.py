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


class ReadinessComponentOut(BaseModel):
    """Один критерий разбивки Readiness — раздел 6.4 ТЗ, разложенный на составляющие."""

    key: str  # sleep_quality | energy | mood | soreness | stress
    value: float  # сырое 1–10 (дневной эндпоинт) или среднее за период
    normalized: float  # 0–100
    weight: float
    contribution: float  # очков из 100 принёс этот критерий
    deficit: float  # очков из возможного максимума (weight*100) критерий стоил


class ReadinessBreakdownOut(BaseModel):
    """Разбивка Readiness за один день. components отсортированы по deficit убыв. —
    первый в списке объясняет просадку сильнее всего."""

    date: date_type
    components: list[ReadinessComponentOut]
    hr_modifier: float
    hr_flag: bool
    injury: bool
    symptom: bool
    unavailable_flag: bool
    score: int
    zone: str


class ReadinessBreakdownAverageOut(BaseModel):
    """Средняя разбивка за период — по дням, где был опрос."""

    date_from: date_type
    date_to: date_type
    days_with_data: int
    components: list[ReadinessComponentOut]
    avg_score: float | None


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
