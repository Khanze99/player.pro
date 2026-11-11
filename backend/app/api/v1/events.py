import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, DbSession, require_workouts_enabled
from app.core import authz
from app.schemas.event import AttendanceIn, AttendanceOut, EventCreateIn, EventOut, EventUpdateIn
from app.schemas.workout import WorkoutResultOut
from app.services import events_service, workout_sessions_service

router = APIRouter(prefix="/events", tags=["events"])


async def _require_manage(db, user, event) -> None:
    """Командное событие правит тренер команды; индивидуальное — его автор."""
    if event.team_id is not None:
        await authz.require_team_coach(db, user, event.team_id)
    elif event.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")


async def _require_own_workout(db, user, workout_id: uuid.UUID | None, athlete_ids) -> None:
    """Упражнения на событии (docs/plan-workout-builder.md): фича включена, источник
    свой (шаблон или список) или список командного события, который тренер вправе
    править. Что событие правит именно он, проверено _require_manage выше."""
    if workout_id is not None or athlete_ids:
        require_workouts_enabled()
    if workout_id is not None:
        await authz.require_event_plan_writer(db, user, workout_id)


@router.post("", response_model=EventOut, status_code=201)
async def create_event(data: EventCreateIn, user: CurrentUser, db: DbSession):
    if data.team_id is not None:
        await authz.require_team_coach(db, user, data.team_id)
    await _require_own_workout(db, user, data.workout_id, data.workout_athlete_ids)
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
    await _require_own_workout(db, user, data.workout_id, data.workout_athlete_ids)
    return await events_service.update_event(db, event, data, user.id)


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: uuid.UUID, user: CurrentUser, db: DbSession):
    event = await events_service.get_event(db, event_id)
    await _require_manage(db, user, event)
    await events_service.delete_event(db, event, user.id)


@router.get(
    "/{event_id}/workout-results",
    response_model=list[WorkoutResultOut],
    dependencies=[Depends(require_workouts_enabled)],
)
async def workout_results(event_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Кто из игроков выполнил упражнения командного события (этап 2
    docs/plan-workout-builder.md). Только штаб команды, остальным 404."""
    event = await events_service.get_event(db, event_id)
    await authz.require_team_event_staff(db, user, event)
    return await workout_sessions_service.event_results(db, event)


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
