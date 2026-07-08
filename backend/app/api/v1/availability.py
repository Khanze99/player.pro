import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.availability import AvailabilityOut, AvailabilitySetIn, AvailabilitySummaryOut
from app.services import availability_service

router = APIRouter(prefix="/availability", tags=["availability"])


@router.put("", response_model=AvailabilityOut)
async def set_status(data: AvailabilitySetIn, user: CurrentUser, db: DbSession):
    """Статус ставит врач или тренер общей команды (открытый вопрос №4 ТЗ — по умолчанию оба)."""
    await authz.ensure_can_manage_athlete_status(db, user, data.athlete_id)
    return await availability_service.set_status(db, user.id, data.athlete_id, data.date, data.status)


@router.get("/athletes/{athlete_id}", response_model=list[AvailabilityOut])
async def history(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=90)
    return await availability_service.get_history(db, athlete_id, date_from, date_to)


@router.get("/athletes/{athlete_id}/summary", response_model=AvailabilitySummaryOut)
async def summary(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    return await availability_service.summary_90d(db, athlete_id, date.today())
