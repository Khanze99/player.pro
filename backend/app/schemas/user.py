import uuid
from datetime import date as date_type
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import Sex


class UserUpdateIn(BaseModel):
    """name не принимаем: он собирается из ФИО (users_service.display_name)."""

    last_name: str | None = Field(default=None, max_length=128)
    first_name: str | None = Field(default=None, max_length=128)
    middle_name: str | None = Field(default=None, max_length=128)
    locale: str | None = Field(default=None, max_length=8)


class AthleteProfileIn(BaseModel):
    position: str | None = Field(default=None, max_length=64)
    baseline_resting_hr: int | None = Field(default=None, ge=20, le=250)
    birthdate: date_type | None = None
    sex: Sex | None = None
    # Границы совпадают с CHECK-ами athlete_profiles (ck_athlete_height_cm/weight_kg)
    height_cm: int | None = Field(default=None, ge=100, le=250)
    weight_kg: Decimal | None = Field(default=None, ge=30, le=250, decimal_places=1)


class AthleteProfileOut(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    position: str | None
    baseline_resting_hr: int | None
    birthdate: date_type | None
    sex: Sex
    # None либо потому, что не заполнено, либо потому, что смотрящему нет согласия
    # на body_metrics — формулировка ответа не должна их различать (см. роут).
    height_cm: int | None
    weight_kg: Decimal | None
