import uuid
from datetime import date as date_type
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import (
    AvailabilityStatus,
    BodyRegion,
    BodySide,
    EventType,
    InjurySeverity,
    InjuryStatus,
    InjuryType,
    SymptomType,
)


class SquadPlayerOut(BaseModel):
    """Строка экрана Squad Status (раздел 3.2 ТЗ)."""

    athlete_id: uuid.UUID
    name: str
    position: str | None
    readiness: int | None
    readiness_zone: str | None
    acwr: float | None
    load_zone: str
    daily_load: float
    load_7d: float
    performance_7d: float | None
    availability: AvailabilityStatus | None
    availability_percent: float | None
    wellness_filled: bool
    active_injury: bool
    hr_flag: bool


class SquadStatusOut(BaseModel):
    team_id: uuid.UUID
    date: date_type
    players: list[SquadPlayerOut]


# ---------------------------------------------------------------- Summary


class MetricGaugeOut(BaseModel):
    """Бублик: значение, шкала, зона-цвет и распределение состава по зонам."""

    value: float | None  # None — данных нет
    scale_max: float  # верх шкалы для отрисовки дуги
    zone: str  # green | yellow | red | no_data
    covered: int  # по скольким игрокам посчитано
    total: int
    distribution: dict[str, int]  # зона → сколько игроков


class WellnessReportOut(BaseModel):
    """Утренний отчёт по опросам за день."""

    filled: int
    total: int
    avg_sleep_quality: float | None
    avg_energy: float | None
    avg_mood: float | None
    avg_stress: float | None
    avg_soreness: float | None
    avg_sleep_hours: float | None
    with_pain: int  # soreness >= 7
    with_injury_flag: int
    with_symptom_flag: int
    missing: list[str]  # имена не заполнивших


class DashboardEventOut(BaseModel):
    id: uuid.UUID
    type: EventType
    title: str | None
    planned_start: datetime
    planned_duration_min: int
    present: int
    absent: int
    rpe_filled: int
    avg_exertion: float | None
    avg_load: float | None


class TeamAlertOut(BaseModel):
    """Строка командного отчёта: игрок и что с ним не так."""

    athlete_id: uuid.UUID
    name: str
    severity: str  # risk | caution
    reasons: list[str]  # машиночитаемые коды, текст подставляет клиент


class TeamSummaryOut(BaseModel):
    team_id: uuid.UUID
    team_name: str
    date: date_type
    squad_size: int
    readiness: MetricGaugeOut
    load: MetricGaugeOut
    performance: MetricGaugeOut
    availability: MetricGaugeOut
    wellness: WellnessReportOut
    past_events: list[DashboardEventOut]
    upcoming_events: list[DashboardEventOut]
    alerts: list[TeamAlertOut]


# ---------------------------------------------------------------- Injuries


class TeamInjuryOut(BaseModel):
    """Запись раздела «Травмы и болезни». kind разводит источник данных."""

    kind: str  # injury | illness
    id: uuid.UUID
    athlete_id: uuid.UUID
    athlete_name: str
    title: str
    body_region: BodyRegion | None
    body_side: BodySide | None
    injury_type: InjuryType | None
    symptom_type: SymptomType | None
    severity: InjurySeverity | None
    status: InjuryStatus | None
    start_date: date_type
    end_date: date_type | None
    days_out: int
    availability: AvailabilityStatus | None


class InjuryHotspotOut(BaseModel):
    """Что чаще всего болит — по зонам тела, за окно."""

    body_region: BodyRegion
    count: int


class TeamInjuriesOut(BaseModel):
    team_id: uuid.UUID
    date: date_type
    window_days: int
    active: list[TeamInjuryOut]
    recent: list[TeamInjuryOut]  # закрытые за окно
    hotspots: list[InjuryHotspotOut]
