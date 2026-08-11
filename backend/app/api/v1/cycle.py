"""Менструальный цикл — спецкатегория персданных (152-ФЗ, ст. 10).

Записывать может только сама спортсменка: эндпоинтов «записать за игрока» нет
и не должно появиться. Чтение чужих данных идёт исключительно через
ensure_can_view_sensitive(scope=cycle), и форма ответа зависит от роли —
тренер и врач получают принципиально разные витрины.
"""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.models.enums import ConsentScope, TeamRole
from app.schemas.cycle import (
    CycleInsightOut,
    CycleLogIn,
    CycleLogOut,
    CycleSettingsIn,
    CycleSettingsOut,
    CycleStateOut,
)
from app.services import cycle_service

router = APIRouter(prefix="/cycle", tags=["cycle"])


@router.get("/me/settings", response_model=CycleSettingsOut)
async def my_settings(user: CurrentUser, db: DbSession):
    return await cycle_service.get_settings(db, user.id)


@router.put("/me/settings", response_model=CycleSettingsOut)
async def update_settings(data: CycleSettingsIn, user: CurrentUser, db: DbSession):
    return await cycle_service.upsert_settings(db, user.id, data)


@router.get("/me/logs", response_model=list[CycleLogOut])
async def my_logs(
    user: CurrentUser, db: DbSession, date_from: date | None = None, date_to: date | None = None
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=90)
    return await cycle_service.get_logs(db, user.id, date_from, date_to)


@router.put("/me/logs", response_model=CycleLogOut)
async def upsert_log(data: CycleLogIn, user: CurrentUser, db: DbSession):
    return await cycle_service.upsert_log(db, user.id, data)


@router.delete("/me/logs/{day}", status_code=204)
async def delete_log(day: date, user: CurrentUser, db: DbSession):
    await cycle_service.delete_log(db, user.id, day)


@router.get("/me/state", response_model=CycleStateOut)
async def my_state(user: CurrentUser, db: DbSession, day: date | None = None):
    return await cycle_service.current_state(db, user.id, day or date.today())


@router.get("/me/insights", response_model=CycleInsightOut)
async def my_insights(user: CurrentUser, db: DbSession, day: date | None = None):
    return await cycle_service.insights(db, user.id, day or date.today())


@router.get("/athletes/{athlete_id}/state")
async def athlete_state(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession, day: date | None = None):
    """Форма ответа зависит от роли: тренеру — фаза и флаг, врачу — детали.

    Response-модель не фиксируем намеренно: две разные витрины по одному адресу
    исключают ситуацию, когда клиент запросил «врачебный» URL и получил больше,
    чем ему положено.
    """
    await authz.ensure_can_view_sensitive(db, user, athlete_id, ConsentScope.cycle)
    day = day or date.today()

    if user.id == athlete_id:
        return await cycle_service.current_state(db, athlete_id, day)

    role = await authz.shared_team_staff_role(db, user.id, athlete_id)
    if role == TeamRole.medic:
        return await cycle_service.staff_view_for_medic(db, athlete_id, day)
    return await cycle_service.staff_view_for_coach(db, athlete_id, day)
