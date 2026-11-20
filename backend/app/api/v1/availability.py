import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.core.availability import AvailabilityError
from app.schemas.availability import (
    AvailabilityChangeIn,
    AvailabilityChangePage,
    AvailabilityMedicalNotePage,
    AvailabilityOut,
    AvailabilitySavedOut,
    AvailabilitySetIn,
    AvailabilityStateOut,
    AvailabilitySummaryOut,
)
from app.services import availability_service

router = APIRouter(prefix="/availability", tags=["availability"])


@router.put("", response_model=AvailabilityOut, deprecated=True)
async def set_status(data: AvailabilitySetIn, user: CurrentUser, db: DbSession):
    await authz.availability_roles(db, user, data.athlete_id)
    raise AvailabilityError("retired", "Используйте POST /availability/changes с направлением и комментарием")


@router.post("/changes", response_model=AvailabilitySavedOut, status_code=201)
async def change(data: AvailabilityChangeIn, user: CurrentUser, db: DbSession, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await availability_service.save_change(db, user, data)


@router.get("/athletes/{athlete_id}/state", response_model=AvailabilityStateOut)
async def state(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession, response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    return await availability_service.get_state(db, user, athlete_id)


@router.get("/athletes/{athlete_id}/changes", response_model=AvailabilityChangePage)
async def changes(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    response: Response,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    response.headers["Cache-Control"] = "private, no-store"
    return await availability_service.change_history(db, user, athlete_id, date_from, date_to, page, size)


@router.get("/athletes/{athlete_id}/medical-notes", response_model=AvailabilityMedicalNotePage)
async def medical_notes(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    response: Response,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    response.headers["Cache-Control"] = "private, no-store"
    return await availability_service.medical_notes(db, user, athlete_id, date_from, date_to, page, size)


@router.get("/athletes/{athlete_id}", response_model=list[AvailabilityOut])
async def history(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    await authz.availability_roles(db, user, athlete_id)
    end = date_to or await availability_service.local_today(db, athlete_id)
    return await availability_service.get_history(db, athlete_id, date_from or end - timedelta(days=89), end)


@router.get("/athletes/{athlete_id}/summary", response_model=AvailabilitySummaryOut)
async def summary(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.availability_roles(db, user, athlete_id)
    return await availability_service.summary_90d(
        db, athlete_id, await availability_service.local_today(db, athlete_id)
    )
