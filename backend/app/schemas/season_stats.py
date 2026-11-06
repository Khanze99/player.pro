import math
import re
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field
from pydantic_core import PydanticCustomError

# Потолок значения метрики: Numeric(10,2) в БД держит до 99 999 999.99, всё
# выше падало бы 500 на INSERT. Реальная сезонная статистика на порядки
# меньше, так что 1 000 000 отсекает опечатки, не данные.
MAX_METRIC_VALUE = 1_000_000

_SEASON_RE = re.compile(r"^(\d{4})/(\d{2})$")


def _validate_season(value: str) -> str:
    """Сезон строго "ГГГГ/ГГ" с соседними годами: иначе "2025/26" и "2025-26"
    станут двумя разными сезонами в селекте паспорта."""
    value = value.strip()
    match = _SEASON_RE.match(value)
    if not match or (int(match.group(1)) + 1) % 100 != int(match.group(2)):
        raise PydanticCustomError("season_format", "Сезон в формате ГГГГ/ГГ, например 2025/26")
    return value


def _validate_team_label(value: str) -> str:
    value = value.strip()
    if not value:
        raise PydanticCustomError("team_label_empty", "Укажите команду")
    return value


def _normalize_competition(value: str | None) -> str | None:
    # "" и null должны быть одним и тем же «без турнира», иначе уникальный
    # ключ записи (uq_season_player_stats_entry) их различит и пропустит дубль
    if value is None:
        return None
    value = value.strip()
    return value or None


def _validate_values(values: dict[str, float]) -> dict[str, float]:
    for key, value in values.items():
        ctx = {"key": key}
        if not math.isfinite(value):
            raise PydanticCustomError("metric_not_finite", "Показатель «{key}»: нужно число", ctx)
        if value < 0:
            raise PydanticCustomError(
                "metric_negative", "Показатель «{key}» не может быть отрицательным", ctx
            )
        if value > MAX_METRIC_VALUE:
            raise PydanticCustomError("metric_too_large", "Показатель «{key}»: слишком большое значение", ctx)
    return values


Season = Annotated[str, Field(max_length=16), AfterValidator(_validate_season)]
TeamLabel = Annotated[str, Field(max_length=128), AfterValidator(_validate_team_label)]
Competition = Annotated[Annotated[str, Field(max_length=128)] | None, AfterValidator(_normalize_competition)]
MetricValues = Annotated[dict[str, float], AfterValidator(_validate_values)]


class SportMetricDefOut(BaseModel):
    """Одна строка справочника метрик спорта — ключи, не подписи (клиент переводит)."""

    model_config = {"from_attributes": True}

    key: str
    category_key: str
    unit: str | None
    pct_of_key: str | None
    on_radar_default: bool
    radar_max: float | None
    sort_order: int


class SeasonStatCreateIn(BaseModel):
    athlete_id: uuid.UUID
    season: Season
    team_label: TeamLabel
    competition: Competition = None
    matches: int = Field(ge=0, default=0)
    minutes: int = Field(ge=0, default=0)
    score: int = Field(ge=0, default=0)
    assists: int = Field(ge=0, default=0)
    penalty_minor: int = Field(ge=0, default=0)
    penalty_major: int = Field(ge=0, default=0)
    # metric_key -> сырое значение. Схема проверяет само число (конечное, ≥0,
    # не больше MAX_METRIC_VALUE), сервис: ключи против каталога спорта и
    # числитель ≤ знаменателя для % (services/season_stats_service.py)
    values: MetricValues = Field(default_factory=dict)


class SeasonStatUpdateIn(BaseModel):
    """athlete_id/sport не редактируются — команду и спорт записи не меняют."""

    season: Season | None = None
    team_label: TeamLabel | None = None
    competition: Competition = None
    matches: int | None = Field(default=None, ge=0)
    minutes: int | None = Field(default=None, ge=0)
    score: int | None = Field(default=None, ge=0)
    assists: int | None = Field(default=None, ge=0)
    penalty_minor: int | None = Field(default=None, ge=0)
    penalty_major: int | None = Field(default=None, ge=0)
    # Если передан — ПОЛНОСТЬЮ заменяет набор значений записи, не патчит по ключам
    values: MetricValues | None = None


class SeasonStatMetricValueOut(BaseModel):
    key: str
    value: float
    per_90: float | None  # value / minutes * 90; null при minutes == 0
    # value / значение метрики pct_of_key этой же записи; null без pct_of_key
    # в каталоге, без значения-знаменателя в записи или при знаменателе == 0
    pct: float | None


class SeasonStatOut(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    sport: str
    season: str
    team_label: str
    competition: str | None
    matches: int
    minutes: int
    score: int
    assists: int
    penalty_minor: int
    penalty_major: int
    score_per_90: float | None
    assists_per_90: float | None
    metrics: list[SeasonStatMetricValueOut]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class TeamBenchmarkMetricOut(BaseModel):
    key: str
    per_90: float | None  # медиана per-90 игроков с данными по метрике
    pct: float | None  # медиана доли для unit="percent", иначе null
    players: int  # сколько игроков вошло в медиану этой метрики


class TeamBenchmarkOut(BaseModel):
    """Медиана команды за сезон: ориентир для радара паспорта.

    В выборку идут только игроки команды с minutes >= min_minutes (per-90 на
    малом времени шумит), и только если таких не меньше MIN_BENCHMARK_PLAYERS:
    медиана из 1-2 игроков фактически раскрывала бы чужие цифры.
    """

    team_id: uuid.UUID
    season: str
    min_minutes: int
    players: int  # игроков в выборке (прошли порог по минутам)
    score_per_90: float | None
    assists_per_90: float | None
    metrics: list[TeamBenchmarkMetricOut]
