"""Команды: CRUD, составы, площадки (раздел 3.4–3.5 ТЗ)."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TeamRole
from app.models.team import Location, Team, TeamMembership
from app.models.user import User, display_name
from app.schemas.team import LocationIn, MemberOut, TeamCreateIn


async def create_team(db: AsyncSession, admin: User, data: TeamCreateIn) -> Team:
    team = Team(org_id=admin.org_id, name=data.name, sport=data.sport)
    db.add(team)
    await db.flush()
    # Создатель-админ автоматически становится главным тренером новой команды
    db.add(TeamMembership(user_id=admin.id, team_id=team.id, team_role=TeamRole.head_coach))
    await db.commit()
    await db.refresh(team)
    return team


async def list_my_teams(db: AsyncSession, user: User) -> list[Team]:
    """Админ — все команды организации, остальные — команды, где состоят."""
    if user.org_id is not None and user.global_role == "admin":
        rows = await db.execute(select(Team).where(Team.org_id == user.org_id).order_by(Team.name))
        return list(rows.scalars())
    rows = await db.execute(
        select(Team)
        .join(TeamMembership, TeamMembership.team_id == Team.id)
        .where(TeamMembership.user_id == user.id)
        .order_by(Team.name)
    )
    return list(rows.scalars())


async def upsert_member(db: AsyncSession, team: Team, user_id: uuid.UUID, team_role: TeamRole) -> None:
    member = await db.get(User, user_id)
    if member is None or member.org_id != team.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден в организации"
        )
    existing = await db.get(TeamMembership, (user_id, team.id))
    if existing is None:
        db.add(TeamMembership(user_id=user_id, team_id=team.id, team_role=team_role))
    else:
        existing.team_role = team_role
    await db.commit()


async def remove_member(db: AsyncSession, team_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await db.execute(
        delete(TeamMembership).where(TeamMembership.team_id == team_id, TeamMembership.user_id == user_id)
    )
    await db.commit()


async def list_members(db: AsyncSession, team_id: uuid.UUID) -> list[MemberOut]:
    rows = await db.execute(
        select(TeamMembership.user_id, User.last_name, User.first_name, TeamMembership.team_role)
        .join(User, User.id == TeamMembership.user_id)
        .where(TeamMembership.team_id == team_id)
        .order_by(User.last_name, User.first_name)
    )
    return [
        MemberOut(user_id=user_id, name=display_name(last, first), team_role=TeamRole(role))
        for user_id, last, first, role in rows
    ]


async def list_athlete_ids(db: AsyncSession, team_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.execute(
        select(TeamMembership.user_id).where(
            TeamMembership.team_id == team_id, TeamMembership.team_role == TeamRole.athlete
        )
    )
    return list(rows.scalars())


async def create_location(db: AsyncSession, team_id: uuid.UUID, data: LocationIn) -> Location:
    location = Location(team_id=team_id, name=data.name)
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return location


async def list_locations(db: AsyncSession, team_id: uuid.UUID) -> list[Location]:
    rows = await db.execute(select(Location).where(Location.team_id == team_id).order_by(Location.name))
    return list(rows.scalars())
