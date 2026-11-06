import uuid
from datetime import datetime

from pydantic import BaseModel, Field


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
    season: str = Field(max_length=16)
    team_label: str = Field(max_length=128)
    competition: str | None = Field(default=None, max_length=128)
    matches: int = Field(ge=0, default=0)
    minutes: int = Field(ge=0, default=0)
    score: int = Field(ge=0, default=0)
    assists: int = Field(ge=0, default=0)
    penalty_minor: int = Field(ge=0, default=0)
    penalty_major: int = Field(ge=0, default=0)
    # metric_key -> сырое значение; валидируется сервисом против каталога спорта
    # команды игрока (неизвестный key — 422), см. services/season_stats_service.py
    values: dict[str, float] = Field(default_factory=dict)


class SeasonStatUpdateIn(BaseModel):
    """athlete_id/sport не редактируются — команду и спорт записи не меняют."""

    season: str | None = Field(default=None, max_length=16)
    team_label: str | None = Field(default=None, max_length=128)
    competition: str | None = Field(default=None, max_length=128)
    matches: int | None = Field(default=None, ge=0)
    minutes: int | None = Field(default=None, ge=0)
    score: int | None = Field(default=None, ge=0)
    assists: int | None = Field(default=None, ge=0)
    penalty_minor: int | None = Field(default=None, ge=0)
    penalty_major: int | None = Field(default=None, ge=0)
    # Если передан — ПОЛНОСТЬЮ заменяет набор значений записи, не патчит по ключам
    values: dict[str, float] | None = None


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
