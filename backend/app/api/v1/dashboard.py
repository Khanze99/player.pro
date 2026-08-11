import uuid
from datetime import date

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.dashboard import SquadStatusOut, TeamInjuriesOut, TeamSummaryOut
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/teams/{team_id}/squad-status", response_model=SquadStatusOut)
async def squad_status(team_id: uuid.UUID, user: CurrentUser, db: DbSession, day: date | None = None):
    await authz.require_team_staff(db, user, team_id)
    return await dashboard_service.squad_status(db, team_id, day or date.today())


@router.get("/teams/{team_id}/summary", response_model=TeamSummaryOut)
async def team_summary(team_id: uuid.UUID, user: CurrentUser, db: DbSession, day: date | None = None):
    await authz.require_team_staff(db, user, team_id)
    return await dashboard_service.team_summary(db, team_id, day or date.today())


@router.get("/teams/{team_id}/injuries", response_model=TeamInjuriesOut)
async def team_injuries(team_id: uuid.UUID, user: CurrentUser, db: DbSession, day: date | None = None):
    await authz.require_team_staff(db, user, team_id)
    return await dashboard_service.team_injuries(db, team_id, day or date.today())
