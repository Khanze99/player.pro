import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.team import LocationIn, LocationOut, MemberIn, MemberOut, TeamCreateIn, TeamOut
from app.services import teams_service

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("", response_model=TeamOut, status_code=201)
async def create_team(data: TeamCreateIn, user: CurrentUser, db: DbSession):
    await authz.require_org_admin(user)
    return await teams_service.create_team(db, user, data)


@router.get("", response_model=list[TeamOut])
async def my_teams(user: CurrentUser, db: DbSession):
    return await teams_service.list_my_teams(db, user)


@router.get("/{team_id}/members", response_model=list[MemberOut])
async def list_members(team_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.require_team_member(db, user, team_id)
    return await teams_service.list_members(db, team_id)


@router.put("/{team_id}/members", status_code=204)
async def upsert_member(team_id: uuid.UUID, data: MemberIn, user: CurrentUser, db: DbSession):
    """Добавление/смена роли: админ организации или главный тренер."""
    team = await authz.get_team(db, team_id)
    if not authz.is_org_admin(user, team.org_id):
        await authz.require_team_role(db, user, team_id, {authz.TeamRole.head_coach})
    await teams_service.upsert_member(db, team, data.user_id, data.team_role)


@router.delete("/{team_id}/members/{user_id}", status_code=204)
async def remove_member(team_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, db: DbSession):
    team = await authz.get_team(db, team_id)
    if not authz.is_org_admin(user, team.org_id):
        await authz.require_team_role(db, user, team_id, {authz.TeamRole.head_coach})
    await teams_service.remove_member(db, team_id, user_id)


@router.post("/{team_id}/locations", response_model=LocationOut, status_code=201)
async def create_location(team_id: uuid.UUID, data: LocationIn, user: CurrentUser, db: DbSession):
    await authz.require_team_coach(db, user, team_id)
    return await teams_service.create_location(db, team_id, data)


@router.get("/{team_id}/locations", response_model=list[LocationOut])
async def list_locations(team_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.require_team_member(db, user, team_id)
    return await teams_service.list_locations(db, team_id)
