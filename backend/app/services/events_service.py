"""Расписание и посещаемость (раздел 3.5 ТЗ) + индивидуальные события игрока (3.1)."""

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AttendanceStatus
from app.models.event import Attendance, Event
from app.models.team import TeamMembership
from app.schemas.event import EventCreateIn, EventUpdateIn


async def create_event(db: AsyncSession, creator_id: uuid.UUID, data: EventCreateIn) -> Event:
    event = Event(
        team_id=data.team_id,
        type=data.type,
        title=data.title,
        planned_start=data.planned_start,
        planned_duration_min=data.planned_duration_min,
        location_id=data.location_id,
        created_by=creator_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def get_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    return event


async def update_event(db: AsyncSession, event: Event, data: EventUpdateIn) -> Event:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await db.commit()
    await db.refresh(event)
    return event


async def delete_event(db: AsyncSession, event: Event) -> None:
    await db.delete(event)
    await db.commit()


async def list_team_events(
    db: AsyncSession, team_id: uuid.UUID, date_from: datetime, date_to: datetime
) -> list[Event]:
    rows = await db.execute(
        select(Event)
        .where(Event.team_id == team_id, Event.planned_start >= date_from, Event.planned_start <= date_to)
        .order_by(Event.planned_start)
    )
    return list(rows.scalars())


async def list_my_events(
    db: AsyncSession, user_id: uuid.UUID, date_from: datetime, date_to: datetime
) -> list[Event]:
    """События команд пользователя + его индивидуальные."""
    team_ids = select(TeamMembership.team_id).where(TeamMembership.user_id == user_id)
    rows = await db.execute(
        select(Event)
        .where(
            Event.planned_start >= date_from,
            Event.planned_start <= date_to,
            (Event.team_id.in_(team_ids)) | ((Event.team_id.is_(None)) & (Event.created_by == user_id)),
        )
        .order_by(Event.planned_start)
    )
    return list(rows.scalars())


async def set_attendance(
    db: AsyncSession, event: Event, user_id: uuid.UUID, attendance_status: AttendanceStatus
) -> Attendance:
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
