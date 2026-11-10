import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.models.enums import TeamRole


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class TeamCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sport: str | None = None
    short_name: str | None = Field(default=None, max_length=12)

    _short = field_validator("short_name", mode="before")(_blank_to_none)


class TeamUpdateIn(BaseModel):
    """PATCH /teams/{id}: только переданные поля. short_name "" или null: убрать короткое имя."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    sport: str | None = None
    short_name: str | None = Field(default=None, max_length=12)

    _short = field_validator("short_name", mode="before")(_blank_to_none)


class TeamOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    sport: str | None
    short_name: str | None = None


class MemberIn(BaseModel):
    user_id: uuid.UUID
    team_role: TeamRole


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    team_role: TeamRole
    since: date


class TransferIn(BaseModel):
    """Перевод игрока между командами одной организации (docs/plan-player-transfer.md).

    team_role не обязателен: по умолчанию сохраняется роль, которая была в команде-
    источнике — обычный перевод игрока не требует явного выбора роли.
    """

    to_team_id: uuid.UUID
    team_role: TeamRole | None = None
    reason: str | None = Field(default=None, max_length=500)


class MembershipOut(BaseModel):
    """Членство текущего пользователя: для показа «команда → роль» в профиле."""

    team_id: uuid.UUID
    team_name: str
    team_role: TeamRole


class LocationIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class LocationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
