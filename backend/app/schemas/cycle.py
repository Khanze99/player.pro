import uuid
from datetime import date as date_type
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import Contraception, CyclePhase, CycleSymptom, FlowIntensity


class SymptomIn(BaseModel):
    symptom: CycleSymptom
    severity: int = Field(ge=1, le=10)


class SymptomOut(BaseModel):
    model_config = {"from_attributes": True}

    symptom: CycleSymptom
    severity: int


class CycleSettingsIn(BaseModel):
    tracking_enabled: bool | None = None
    average_cycle_length: int | None = Field(default=None, ge=21, le=45)
    average_period_length: int | None = Field(default=None, ge=1, le=10)
    contraception: Contraception | None = None


class CycleSettingsOut(BaseModel):
    model_config = {"from_attributes": True}

    tracking_enabled: bool
    average_cycle_length: int
    average_period_length: int
    contraception: Contraception


class CycleLogIn(BaseModel):
    date: date_type
    period_start: bool = False
    period_end: bool = False
    flow: FlowIntensity | None = None
    note: str | None = None
    symptoms: list[SymptomIn] = []


class CycleLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    date: date_type
    period_start: bool
    period_end: bool
    flow: FlowIntensity | None
    note: str | None
    symptoms: list[SymptomOut]


class CycleStateOut(BaseModel):
    """Полная картина — только для самой спортсменки и для medic."""

    date: date_type
    tracking_enabled: bool
    cycle_day: int | None
    phase: CyclePhase
    last_period_start: date_type | None
    next_period_predicted: date_type | None
    average_cycle_length: int
    observed_cycle_length: int | None
    days_since_last_period: int | None
    amenorrhea_flag: bool
    contraception: Contraception


class CycleStaffCoachOut(BaseModel):
    """Витрина тренера. Намеренно бедная: фаза и один флаг, без дат и симптомов."""

    athlete_id: uuid.UUID
    date: date_type
    phase: CyclePhase
    has_training_affecting_symptoms: bool


class CycleStaffMedicOut(BaseModel):
    """Витрина врача: клиническая картина целиком."""

    athlete_id: uuid.UUID
    state: CycleStateOut
    recent_symptoms: list[dict[str, Any]]


class PhaseInsightOut(BaseModel):
    phase: CyclePhase
    days: int
    avg_readiness: float | None
    avg_load: float | None


class CycleInsightOut(BaseModel):
    window_days: int
    cycles_recorded: int
    covered_days: int
    enough_data: bool
    phases: list[PhaseInsightOut]
