"""Расписание и посещаемость (раздел 3.5 ТЗ) + индивидуальные события игрока (3.1)."""

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AttendanceStatus, TeamRole
from app.models.event import Attendance, Event, EventWorkoutAthlete
from app.models.team import TeamMembership
from app.models.workout import Workout
from app.schemas.event import EventCreateIn, EventUpdateIn
from app.services import notifications_service, workouts_service


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


async def _set_workout_athletes(db: AsyncSession, event: Event, athlete_ids: list[uuid.UUID]) -> None:
    """Кому назначены упражнения командного события (этап 2 docs/plan-workout-builder.md).
    Пустой список: всем игрокам команды. Только игроки команды этого события."""
    ids = list(dict.fromkeys(athlete_ids))
    if ids:
        if event.team_id is None:
            raise _unprocessable("Назначать игроков можно только на командной тренировке")
        if event.workout_id is None:
            raise _unprocessable("Сначала добавьте упражнения")
        athletes = set(
            await db.scalars(
                select(TeamMembership.user_id).where(
                    TeamMembership.team_id == event.team_id,
                    TeamMembership.team_role == TeamRole.athlete,
                    TeamMembership.user_id.in_(ids),
                )
            )
        )
        if len(athletes) != len(ids):
            raise _unprocessable("Назначить упражнения можно только игрокам команды события")
    event.workout_athletes = [EventWorkoutAthlete(athlete_id=athlete_id) for athlete_id in ids]


async def _reload(db: AsyncSession, event_id: uuid.UUID) -> Event:
    """Событие заново со списком и назначениями: refresh не перечитывает selectin-связи."""
    return await db.scalar(
        select(Event).where(Event.id == event_id).execution_options(populate_existing=True)
    )


def participant_of(user_id: uuid.UUID):
    """Условие: командное событие видно этому игроку. Если тренер выбрал игроков
    в «Кому» (этап 2 docs/plan-workout-builder.md), событие только для них;
    без выбора для всей команды."""
    assigned = select(EventWorkoutAthlete.event_id).where(EventWorkoutAthlete.event_id == Event.id)
    return ~assigned.exists() | assigned.where(EventWorkoutAthlete.athlete_id == user_id).exists()


def _plan_taken() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail="Этот список уже стоит на другом событии"
    )


async def _event_plan_id(
    db: AsyncSession, workout_id: uuid.UUID | None, actor_id: uuid.UUID, event_id: uuid.UUID | None = None
) -> uuid.UUID | None:
    """Что ставим на событие: шаблон копируется в новый план, план события идёт
    как есть. План, уже стоящий на другом событии, тоже копируется: у каждого
    события свой список, правка одного не меняет другое. Копия принадлежит тому,
    кто её ставит, а не автору источника."""
    if workout_id is None:
        return None
    workout = await db.get(Workout, workout_id)
    if workout is None:  # роут уже проверил владельца
        return None
    if not workout.is_template:
        query = select(Event.id).where(Event.workout_id == workout_id)
        if event_id is not None:
            query = query.where(Event.id != event_id)
        other = await db.scalar(query.limit(1))
        if other is None:
            return workout_id
    return (await workouts_service.copy_as_event_plan(db, workout, actor_id)).id


async def create_event(db: AsyncSession, creator_id: uuid.UUID, data: EventCreateIn) -> Event:
    event = Event(
        team_id=data.team_id,
        type=data.type,
        title=data.title,
        planned_start=data.planned_start,
        planned_duration_min=data.planned_duration_min,
        location_id=data.location_id,
        created_by=creator_id,
        workout_id=await _event_plan_id(db, data.workout_id, creator_id),
        workout_athletes=[],
    )
    await _set_workout_athletes(db, event, data.workout_athlete_ids)
    db.add(event)
    try:
        await db.flush()
    except IntegrityError:  # параллельно этот же список поставили на другое событие
        await db.rollback()
        raise _plan_taken() from None
    await notifications_service.notify_event_created(db, event, creator_id)
    await db.commit()
    return await _reload(db, event.id)


async def get_event(db: AsyncSession, event_id: uuid.UUID, *, lock: bool = False) -> Event:
    """lock: строка события под FOR UPDATE до commit, чтобы две правки не
    пересобирали назначения одновременно."""
    query = select(Event).where(Event.id == event_id)
    if lock:
        query = query.with_for_update(of=Event).execution_options(populate_existing=True)
    event = await db.scalar(query)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    return event


async def update_event(db: AsyncSession, event: Event, data: EventUpdateIn, actor_id: uuid.UUID) -> Event:
    updates = data.model_dump(exclude_unset=True)
    athlete_ids = updates.pop("workout_athlete_ids", None)
    participants_before = event.workout_athlete_ids
    released: uuid.UUID | None = None
    if "workout_id" in updates:
        new_plan = await _event_plan_id(db, updates["workout_id"], actor_id, event.id)
        if new_plan != event.workout_id:
            released = event.workout_id
        updates["workout_id"] = new_plan
    changed: set[str] = set()
    for field, value in updates.items():
        if getattr(event, field) != value:
            changed.add(field)
        setattr(event, field, value)
    # Упражнения сняли: назначения очищаются (а непустое назначение без них 422)
    if athlete_ids is not None or event.workout_id is None:
        await _set_workout_athletes(db, event, athlete_ids or [])
    await notifications_service.notify_event_updated(db, event, changed, actor_id, participants_before)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _plan_taken() from None
    await workouts_service.release_event_plan(db, released)
    await db.commit()
    return await _reload(db, event.id)


async def delete_event(db: AsyncSession, event: Event, actor_id: uuid.UUID) -> None:
    await notifications_service.notify_event_cancelled(db, event, actor_id)
    plan_id = event.workout_id
    await db.delete(event)
    await db.flush()
    await workouts_service.release_event_plan(db, plan_id)
    await db.commit()


async def list_team_events(
    db: AsyncSession,
    team_id: uuid.UUID,
    date_from: datetime,
    date_to: datetime,
    athlete_id: uuid.UUID | None = None,
) -> list[Event]:
    """athlete_id: смотрит игрок команды, ему только события, где он участник."""
    query = select(Event).where(
        Event.team_id == team_id, Event.planned_start >= date_from, Event.planned_start <= date_to
    )
    if athlete_id is not None:
        query = query.where(participant_of(athlete_id))
    rows = await db.execute(query.order_by(Event.planned_start))
    return list(rows.scalars())


async def list_my_events(
    db: AsyncSession, user_id: uuid.UUID, date_from: datetime, date_to: datetime
) -> list[Event]:
    """События команд пользователя + его индивидуальные. Игроку из командных
    только те, где он участник (participant_of), штабу все."""
    mine = select(TeamMembership.team_id).where(TeamMembership.user_id == user_id)
    staff_teams = mine.where(TeamMembership.team_role != TeamRole.athlete)
    athlete_teams = mine.where(TeamMembership.team_role == TeamRole.athlete)
    rows = await db.execute(
        select(Event)
        .where(
            Event.planned_start >= date_from,
            Event.planned_start <= date_to,
            Event.team_id.in_(staff_teams)
            | (Event.team_id.in_(athlete_teams) & participant_of(user_id))
            | ((Event.team_id.is_(None)) & (Event.created_by == user_id)),
        )
        .order_by(Event.planned_start)
    )
    return list(rows.scalars())


async def set_attendance(
    db: AsyncSession, event: Event, user_id: uuid.UUID, attendance_status: AttendanceStatus
) -> Attendance:
    assigned = event.workout_athlete_ids
    if assigned and user_id not in assigned:
        raise _unprocessable("Игрок не участвует в этом событии")
    record = await db.get(Attendance, (event.id, user_id))
    if record is None:
        record = Attendance(event_id=event.id, user_id=user_id, status=attendance_status)
        db.add(record)
    else:
        record.status = attendance_status
    await db.commit()
    return record


async def list_attendance(db: AsyncSession, event_id: uuid.UUID) -> list[Attendance]:
    rows = await db.execute(select(Attendance).where(Attendance.event_id == event_id))
    return list(rows.scalars())
