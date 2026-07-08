import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.rpe import RpeCreateIn, RpeCreateOut, RpeOut
from app.services import rpe_service

router = APIRouter(prefix="/rpe", tags=["rpe"])


@router.post("", response_model=RpeCreateOut, status_code=201)
async def create_entry(data: RpeCreateIn, user: CurrentUser, db: DbSession):
    entry, streak = await rpe_service.create_entry(db, user.id, data)
    return RpeCreateOut(entry=RpeOut.model_validate(entry), streak=streak)


@router.get("/me", response_model=list[RpeOut])
async def my_history(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=30)
    return await rpe_service.get_history(db, user.id, date_from, date_to)


@router.get("/athletes/{athlete_id}", response_model=list[RpeOut])
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
    return await rpe_service.get_history(db, athlete_id, date_from, date_to)
