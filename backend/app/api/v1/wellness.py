import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.models.enums import ConsentScope
from app.schemas.wellness import WellnessCreateIn, WellnessCreateOut, WellnessOut
from app.services import analytics_service, wellness_service

router = APIRouter(prefix="/wellness", tags=["wellness"])


@router.post("", response_model=WellnessCreateOut, status_code=201)
async def create_entry(data: WellnessCreateIn, user: CurrentUser, db: DbSession):
    entry, streak = await wellness_service.create_entry(db, user.id, data)
    # Полный ряд DailyMetric считает Celery-задача; в ответ отдаём синхронный
    # расчёт Readiness за этот день, чтобы игрок увидел балл сразу.
    readiness = await analytics_service.readiness_preview(db, user.id, entry)
    return WellnessCreateOut(
        entry=WellnessOut.model_validate(entry),
        readiness=readiness.score,
        readiness_zone=readiness.zone,
        streak=streak,
    )


@router.get("/me", response_model=list[WellnessOut])
async def my_history(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=30)
    return await wellness_service.get_history(db, user.id, date_from, date_to)


@router.get("/athletes/{athlete_id}", response_model=list[WellnessOut])
async def athlete_history(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=30)
    entries = await wellness_service.get_history(db, athlete_id, date_from, date_to)
    # weight_kg — спецкатегория body_metrics (docs/plan-weight-tracking.md), в
    # отличие от остальных полей этого ответа (pain_points/comment и т.п., см.
    # docs/plan-recovery-methods.md). Тот же приём нулирования, что в
    # users.py:athlete_profile — проверяем раз на весь список, не на каждую запись.
    try:
        await authz.ensure_can_view_sensitive(db, user, athlete_id, ConsentScope.body_metrics)
    except HTTPException:
        for entry in entries:
            entry.weight_kg = None
    return entries
