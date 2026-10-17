"""Команды: CRUD, составы, площадки (раздел 3.4–3.5 ТЗ)."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import STAFF_ROLES, TeamRole
from app.models.team import Location, Team, TeamMembership
from app.models.user import User, display_name
from app.schemas.team import LocationIn, MemberOut, TeamCreateIn, TransferIn
from app.services import audit_service


def _is_staff_role(role: TeamRole) -> bool:
    return role in STAFF_ROLES


async def has_role_category_conflict(
    db: AsyncSession, user_id: uuid.UUID, team_role: TeamRole, *, exclude_team_id: uuid.UUID | None = None
) -> bool:
    """У пользователя уже есть членство другой категории (игрок vs штаб)?

    Категория роли одна на всего пользователя, команды — разные: head_coach в
    одной команде и coach в другой — нормально (обе штаб), athlete в двух
    командах разом — тоже нормально, а вот athlete в одной и head_coach/coach/
    medic в другой — нет: аккаунт либо игрок, либо штаб, смешивать нельзя.
    """
    target_is_staff = _is_staff_role(team_role)
    stmt = select(TeamMembership.team_role).where(TeamMembership.user_id == user_id)
    if exclude_team_id is not None:
        stmt = stmt.where(TeamMembership.team_id != exclude_team_id)
    rows = await db.execute(stmt)
    return any(_is_staff_role(TeamRole(existing)) != target_is_staff for (existing,) in rows)


async def ensure_single_role_category(
    db: AsyncSession, user_id: uuid.UUID, team_role: TeamRole, *, exclude_team_id: uuid.UUID | None = None
) -> None:
    if await has_role_category_conflict(db, user_id, team_role, exclude_team_id=exclude_team_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="У пользователя уже есть роль другой категории (игрок/штаб) в другой команде",
        )


async def create_team(db: AsyncSession, admin: User, data: TeamCreateIn) -> Team:
    await ensure_single_role_category(db, admin.id, TeamRole.head_coach)
    team = Team(org_id=admin.org_id, name=data.name, sport=data.sport)
    db.add(team)
    await db.flush()
    # Создатель-админ автоматически становится главным тренером новой команды
    db.add(TeamMembership(user_id=admin.id, team_id=team.id, team_role=TeamRole.head_coach))
    await db.commit()
    await db.refresh(team)
    return team


async def list_my_teams(db: AsyncSession, user: User) -> list[Team]:
    """Команды, где состоят (TeamMembership) + для admin ещё все команды своей организации.

    Объединение, а не either/or: пока нет отдельного флоу кросс-организационного
    доступа (docs/plan-team-selector.md — открытый вопрос), такой доступ выдаётся
    вручную строкой в team_memberships на команду чужой организации. Админ должен
    видеть её наравне со своими — старая версия (только Team.org_id == user.org_id
    для admin) такие строки молча игнорировала.
    """
    stmt = select(Team).distinct()
    if user.org_id is not None and user.global_role == "admin":
        stmt = stmt.outerjoin(
            TeamMembership,
            (TeamMembership.team_id == Team.id) & (TeamMembership.user_id == user.id),
        ).where(or_(Team.org_id == user.org_id, TeamMembership.user_id == user.id))
    else:
        stmt = stmt.join(TeamMembership, TeamMembership.team_id == Team.id).where(
            TeamMembership.user_id == user.id
        )
    rows = await db.execute(stmt.order_by(Team.name))
    return list(rows.scalars())


async def upsert_member(db: AsyncSession, team: Team, user_id: uuid.UUID, team_role: TeamRole) -> None:
    member = await db.get(User, user_id)
    if member is None or member.org_id != team.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден в организации"
        )
    await ensure_single_role_category(db, user_id, team_role, exclude_team_id=team.id)
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
        select(
            TeamMembership.user_id,
            User.last_name,
            User.first_name,
            TeamMembership.team_role,
            TeamMembership.created_at,
        )
        .join(User, User.id == TeamMembership.user_id)
        .where(TeamMembership.team_id == team_id)
        .order_by(User.last_name, User.first_name)
    )
    return [
        MemberOut(
            user_id=user_id,
            name=display_name(last, first),
            team_role=TeamRole(role),
            since=created_at.date(),
        )
        for user_id, last, first, role, created_at in rows
    ]


async def transfer_member(
    db: AsyncSession, admin: User, from_team: Team, to_team: Team, user_id: uuid.UUID, data: TransferIn
) -> MemberOut:
    """Переводит игрока из одной команды организации в другую (docs/plan-player-transfer.md).

    Жёсткий перевод: старое членство удаляется, новое создаётся — в одной
    транзакции с записью в аудит. Права на обе команды проверены вызывающим
    (authz.require_org_admin_for_teams), здесь — только бизнес-правила.
    """
    if from_team.id == to_team.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Команда-источник и получатель совпадают"
        )

    member = await db.get(User, user_id)
    if member is None or member.org_id != admin.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден в организации"
        )

    current = await db.get(TeamMembership, (user_id, from_team.id))
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Игрок не состоит в команде-источнике"
        )

    existing_target = await db.get(TeamMembership, (user_id, to_team.id))
    if existing_target is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Игрок уже в этой команде")

    team_role = data.team_role or TeamRole(current.team_role)
    # exclude_team_id=from_team.id: старое членство и так будет удалено, сравнивать
    # с ним нечего — проверяем только ВСЕ ОСТАЛЬНЫЕ команды пользователя.
    await ensure_single_role_category(db, user_id, team_role, exclude_team_id=from_team.id)

    await db.delete(current)
    await db.flush()
    new_membership = TeamMembership(user_id=user_id, team_id=to_team.id, team_role=team_role)
    db.add(new_membership)
    await db.flush()

    audit_service.log(
        db,
        actor_id=admin.id,
        action="team.transfer",
        resource_type="user",
        resource_id=user_id,
        detail={
            "from_team_id": str(from_team.id),
            "to_team_id": str(to_team.id),
            "team_role": team_role.value,
            "reason": data.reason,
        },
    )
    await db.commit()
    await db.refresh(new_membership)

    return MemberOut(
        user_id=user_id,
        name=display_name(member.last_name, member.first_name),
        team_role=team_role,
        since=new_membership.created_at.date(),
    )


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
