import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field

from app.models.enums import BodyRegion, BodySide, InjurySeverity, InjuryStatus, InjuryType


class InjuryCreateIn(BaseModel):
    athlete_id: uuid.UUID
    type: str = Field(min_length=1, max_length=128)
    location: str | None = Field(default=None, max_length=128)
    body_region: BodyRegion | None = None
    body_side: BodySide | None = None
    injury_type: InjuryType | None = None
    severity: InjurySeverity
    start_date: date_type
    end_date: date_type | None = None


class InjuryUpdateIn(BaseModel):
    type: str | None = None
    location: str | None = None
    body_region: BodyRegion | None = None
    body_side: BodySide | None = None
    injury_type: InjuryType | None = None
    severity: InjurySeverity | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: InjuryStatus | None = None


class InjuryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    athlete_id: uuid.UUID
    type: str
    location: str | None
    body_region: BodyRegion | None
    body_side: BodySide | None
    injury_type: InjuryType | None
    severity: InjurySeverity
    start_date: date_type
    end_date: date_type | None
    status: InjuryStatus
