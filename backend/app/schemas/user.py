import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field

from app.models.enums import Sex


class UserUpdateIn(BaseModel):
    """name не принимаем: он собирается из ФИО (users_service.display_name)."""

    last_name: str | None = Field(default=None, max_length=128)
    first_name: str | None = Field(default=None, max_length=128)
    middle_name: str | None = Field(default=None, max_length=128)
    locale: str | None = Field(default=None, max_length=8)


class AthleteProfileIn(BaseModel):
    position: str | None = None
    baseline_resting_hr: int | None = Field(default=None, ge=20, le=250)
    birthdate: date_type | None = None
    sex: Sex | None = None


class AthleteProfileOut(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    position: str | None
    baseline_resting_hr: int | None
    birthdate: date_type | None
    sex: Sex
