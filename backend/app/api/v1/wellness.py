import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.wellness import WellnessCreateIn, WellnessCreateOut, WellnessOut
from app.services import wellness_service
from app.services.analytics_service import get_metrics

router = APIRouter(prefix="/wellness", tags=["wellness"])


@router.post("", response_model=WellnessCreateOut, status_code=201)
async def create_entry(data: WellnessCreateIn, user: CurrentUser, db: DbSession):
    entry, streak = await wellness_service.create_entry(db, user.id, data)
    metrics = await get_metrics(db, user.id, entry.date, entry.date)
    metric = metrics[0] if metrics else None
    return WellnessCreateOut(
        entry=WellnessOut.model_validate(entry),
        readiness=metric.readiness if metric and metric.readiness is not None else 0,
        readiness_zone=metric.readiness_zone or "red" if metric else "red",
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
    return await wellness_service.get_history(db, athlete_id, date_from, date_to)
