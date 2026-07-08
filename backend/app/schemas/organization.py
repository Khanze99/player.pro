import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import GlobalRole, TeamRole


class OrganizationCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    timezone: str = "UTC"
    locale: str = "ru"


class OrganizationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    timezone: str
    locale: str


class InvitationCreateIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)  # телефон или email
    name: str | None = Field(default=None, max_length=255)
    global_role: GlobalRole = GlobalRole.player
    team_id: uuid.UUID | None = None
    team_role: TeamRole | None = None


class InvitationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    identifier: str
    name: str | None
    global_role: GlobalRole
    team_id: uuid.UUID | None
    team_role: TeamRole | None
    status: str
    expires_at: datetime
