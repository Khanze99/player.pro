import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field

from app.models.enums import BodyRegion, BodySide, InjuryType, SymptomType


class PainPointIn(BaseModel):
    region: BodyRegion
    side: BodySide = BodySide.center
    severity: int = Field(ge=1, le=10)


class PainPointOut(BaseModel):
    model_config = {"from_attributes": True}

    region: BodyRegion
    side: BodySide
    severity: int


class WellnessCreateIn(BaseModel):
    date: date_type
    mood: int = Field(ge=1, le=10)
    energy: int = Field(ge=1, le=10)
    sleep_quality: int = Field(ge=1, le=10)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress: int = Field(ge=1, le=10)
    soreness: int = Field(ge=1, le=10)
    injury: bool = False
    injury_details: str | None = Field(default=None, max_length=512)
    injury_area: BodyRegion | None = None
    injury_type: InjuryType | None = None
    symptom: bool = False
    symptom_details: str | None = Field(default=None, max_length=512)
    symptom_type: SymptomType | None = None
    resting_hr: int | None = Field(default=None, ge=20, le=250)
    comment: str | None = Field(default=None, max_length=1000)
    pain_points: list[PainPointIn] = Field(default_factory=list, max_length=40)


class WellnessOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    athlete_id: uuid.UUID
    date: date_type
    mood: int
    energy: int
    sleep_quality: int
    sleep_hours: float | None
    stress: int
    soreness: int
    injury: bool
    injury_details: str | None
    injury_area: BodyRegion | None
    injury_type: InjuryType | None
    symptom: bool
    symptom_details: str | None
    symptom_type: SymptomType | None
    resting_hr: int | None
    comment: str | None
    pain_points: list[PainPointOut] = Field(default_factory=list)


class WellnessCreateOut(BaseModel):
    entry: WellnessOut
    readiness: int
    readiness_zone: str
    streak: int
