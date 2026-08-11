"""Authz-слой: все правила доступа в одном месте (раздел 2 ТЗ), без RLS в БД.

Матрица (2.4): athlete — только свои данные; coach/head_coach/medic — данные
своей команды; admin — вся организация.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    COACH_ROLES,
    STAFF_ROLES,
    ConsentAudience,
    ConsentScope,
    GlobalRole,
    TeamRole,
)
from app.models.team import Team, TeamMembership
from app.models.user import User


def _forbidden(detail: str = "Недостаточно прав") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def is_org_admin(user: User, org_id: uuid.UUID | None = None) -> bool:
    if user.global_role != GlobalRole.admin or user.org_id is None:
        return False
    return org_id is None or user.org_id == org_id


async def get_team(db: AsyncSession, team_id: uuid.UUID) -> Team:
    team = await db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Команда не найдена")
    return team


async def get_team_role(db: AsyncSession, user_id: uuid.UUID, team_id: uuid.UUID) -> TeamRole | None:
    row = await db.execute(
        select(TeamMembership.team_role).where(
            TeamMembership.user_id == user_id, TeamMembership.team_id == team_id
        )
    )
    role = row.scalar_one_or_none()
    return TeamRole(role) if role else None


async def require_team_role(
    db: AsyncSession, user: User, team_id: uuid.UUID, allowed: set[TeamRole]
) -> TeamRole | None:
    """Доступ, если у пользователя одна из ролей в команде; admin организации — всегда."""
    team = await get_team(db, team_id)
    if is_org_admin(user, team.org_id):
        return None
    role = await get_team_role(db, user.id, team_id)
    if role is None or role not in allowed:
        raise _forbidden()
    return role


async def require_team_member(db: AsyncSession, user: User, team_id: uuid.UUID) -> TeamRole | None:
    return await require_team_role(db, user, team_id, set(TeamRole))


async def require_team_staff(db: AsyncSession, user: User, team_id: uuid.UUID) -> TeamRole | None:
    return await require_team_role(db, user, team_id, STAFF_ROLES)


async def require_team_coach(db: AsyncSession, user: User, team_id: uuid.UUID) -> TeamRole | None:
    return await require_team_role(db, user, team_id, COACH_ROLES)


async def require_org_admin(user: User) -> None:
    if not is_org_admin(user):
        raise _forbidden("Требуется роль администратора организации")


async def _shared_team_staff_role(
    db: AsyncSession, viewer_id: uuid.UUID, athlete_id: uuid.UUID
) -> TeamRole | None:
    """Роль viewer'а (staff) в какой-либо команде, где athlete состоит как athlete."""
    viewer_tm = TeamMembership.__table__.alias("viewer_tm")
    athlete_tm = TeamMembership.__table__.alias("athlete_tm")
    row = await db.execute(
        select(viewer_tm.c.team_role)
        .select_from(viewer_tm.join(athlete_tm, viewer_tm.c.team_id == athlete_tm.c.team_id))
        .where(
            viewer_tm.c.user_id == viewer_id,
            athlete_tm.c.user_id == athlete_id,
            viewer_tm.c.team_role.in_([r.value for r in STAFF_ROLES]),
        )
        .limit(1)
    )
    role = row.scalar_one_or_none()
    return TeamRole(role) if role else None


async def ensure_can_view_athlete(db: AsyncSession, viewer: User, athlete_id: uuid.UUID) -> None:
    """Свои данные — всегда; staff — по общей команде; admin — по организации."""
    if viewer.id == athlete_id:
        return
    athlete = await db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игрок не найден")
    if is_org_admin(viewer, athlete.org_id):
        return
    if await _shared_team_staff_role(db, viewer.id, athlete_id) is not None:
        return
    raise _forbidden()


async def shared_team_staff_role(
    db: AsyncSession, viewer_id: uuid.UUID, athlete_id: uuid.UUID
) -> TeamRole | None:
    """Публичная обёртка: роутам нужно знать роль, чтобы выбрать витрину данных."""
    return await _shared_team_staff_role(db, viewer_id, athlete_id)


async def ensure_can_view_sensitive(
    db: AsyncSession, viewer: User, athlete_id: uuid.UUID, scope: ConsentScope
) -> None:
    """Спецкатегории персданных (цикл, питание, состав тела) — 152-ФЗ, ст. 10.

    Отличия от ensure_can_view_athlete, каждое — сознательное:
      · доступ даёт не роль, а согласие самого игрока;
      · admin НЕ проходит: админ организации это менеджер клуба, а не медработник;
      · medic и coach разведены — открыть врачу не значит открыть тренеру.

    Формулировка ошибки одинакова для «нет согласия» и «нет данных»: иначе тренер
    видел бы, кто согласия не дал, и согласие перестало бы быть добровольным.
    """
    if viewer.id == athlete_id:
        return

    athlete = await db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игрок не найден")

    role = await _shared_team_staff_role(db, viewer.id, athlete_id)
    if role is None:
        raise _sensitive_forbidden()

    required = ConsentAudience.medic if role == TeamRole.medic else ConsentAudience.coach

    # Импорт здесь: authz грузится раньше сервисов, циклический импорт на модульном уровне
    from app.services import consent_service

    if not await consent_service.covers(db, athlete_id, scope, required):
        raise _sensitive_forbidden()


def _sensitive_forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Данные недоступны")


async def ensure_can_manage_athlete_status(db: AsyncSession, viewer: User, athlete_id: uuid.UUID) -> None:
    """Статусы доступности/травмы: medic — CRUD, coach/head_coach — запись статуса, admin — да."""
    athlete = await db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Игрок не найден")
    if is_org_admin(viewer, athlete.org_id):
        return
    role = await _shared_team_staff_role(db, viewer.id, athlete_id)
    if role in STAFF_ROLES:
        return
    raise _forbidden()
