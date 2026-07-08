import uuid

from pydantic import BaseModel, Field

from app.models.enums import TeamRole


class TeamCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sport: str | None = None


class TeamOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    sport: str | None


class MemberIn(BaseModel):
    user_id: uuid.UUID
    team_role: TeamRole


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    team_role: TeamRole


class LocationIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class LocationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
