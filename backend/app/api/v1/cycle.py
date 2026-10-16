"""Менструальный цикл — спецкатегория персданных (152-ФЗ, ст. 10).

Минимальный трекинг (решение 2026-10-16): отметка дня + болевой порог, без фазы/
прогноза/симптомов. Записывать может только сама спортсменка: эндпоинтов
«записать за игрока» нет и не должно появиться. Чтение чужих данных — только
через ensure_can_view_sensitive(scope=cycle); витрина одна для coach и medic,
отдельных форм ответа по ролям больше нет, детализации не осталось скрывать.
"""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.models.enums import ConsentScope
from app.schemas.cycle import CycleLogIn, CycleLogOut, CycleSettingsIn, CycleSettingsOut, CycleStaffOut
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


@router.get("/athletes/{athlete_id}/state", response_model=CycleStaffOut)
async def athlete_state(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession, day: date | None = None):
    """Доступ (свой/чужой, согласие) — ensure_can_view_sensitive; сам игрок — всегда."""
    await authz.ensure_can_view_sensitive(db, user, athlete_id, ConsentScope.cycle)
    return await cycle_service.staff_view(db, athlete_id, day or date.today())
