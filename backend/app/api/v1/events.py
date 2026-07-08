import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.event import AttendanceIn, AttendanceOut, EventCreateIn, EventOut, EventUpdateIn
from app.services import events_service

router = APIRouter(prefix="/events", tags=["events"])


async def _require_manage(db, user, event) -> None:
    """Командное событие правит тренер команды; индивидуальное — его автор."""
    if event.team_id is not None:
        await authz.require_team_coach(db, user, event.team_id)
    elif event.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


@router.post("", response_model=EventOut, status_code=201)
async def create_event(data: EventCreateIn, user: CurrentUser, db: DbSession):
    if data.team_id is not None:
        await authz.require_team_coach(db, user, data.team_id)
    return await events_service.create_event(db, user.id, data)


@router.get("/me", response_model=list[EventOut])
async def my_events(
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    date_from = date_from or datetime.now(UTC) - timedelta(days=7)
    date_to = date_to or datetime.now(UTC) + timedelta(days=30)
    return await events_service.list_my_events(db, user.id, date_from, date_to)


@router.get("/teams/{team_id}", response_model=list[EventOut])
async def team_events(
    team_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    await authz.require_team_member(db, user, team_id)
    date_from = date_from or datetime.now(UTC) - timedelta(days=7)
    date_to = date_to or datetime.now(UTC) + timedelta(days=30)
    return await events_service.list_team_events(db, team_id, date_from, date_to)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(event_id: uuid.UUID, data: EventUpdateIn, user: CurrentUser, db: DbSession):
    event = await events_service.get_event(db, event_id)
    await _require_manage(db, user, event)
    return await events_service.update_event(db, event, data)


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: uuid.UUID, user: CurrentUser, db: DbSession):
    event = await events_service.get_event(db, event_id)
    await _require_manage(db, user, event)
    await events_service.delete_event(db, event)


@router.put("/{event_id}/attendance", response_model=AttendanceOut)
async def set_attendance(event_id: uuid.UUID, data: AttendanceIn, user: CurrentUser, db: DbSession):
    event = await events_service.get_event(db, event_id)
    if event.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Посещаемость ведётся только для командных событий",
        )
    await authz.require_team_coach(db, user, event.team_id)
    return await events_service.set_attendance(db, event, data.user_id, data.status)


@router.get("/{event_id}/attendance", response_model=list[AttendanceOut])
async def list_attendance(event_id: uuid.UUID, user: CurrentUser, db: DbSession):
    event = await events_service.get_event(db, event_id)
    if event.team_id is not None:
        await authz.require_team_staff(db, user, event.team_id)
    elif event.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    return await events_service.list_attendance(db, event_id)
