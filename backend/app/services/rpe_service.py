"""RPE после нагрузки: session_load = RPE × минуты, окно ввода 24 ч (раздел 3.1 ТЗ)."""

import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.calculations import session_load
from app.models.enums import StreakType
from app.models.event import Event
from app.models.rpe import RpeEntry
from app.schemas.rpe import RpeCreateIn
from app.services import analytics_service, streaks_service

LATE_WINDOW = timedelta(hours=24)


async def create_entry(db: AsyncSession, athlete_id: uuid.UUID, data: RpeCreateIn) -> tuple[RpeEntry, int]:
    is_late = False
    if data.event_id is not None:
        event = await db.get(Event, data.event_id)
        if event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
        planned_start = (
            event.planned_start if event.planned_start.tzinfo else event.planned_start.replace(tzinfo=UTC)
        )
        session_end = planned_start + timedelta(minutes=event.planned_duration_min)
        is_late = datetime.now(UTC) > session_end + LATE_WINDOW

    entry = RpeEntry(
        athlete_id=athlete_id,
        event_id=data.event_id,
        date=data.date,
        exertion=data.exertion,
        performance=data.performance,
        duration_min=data.duration_min,
        session_load=session_load(data.exertion, data.duration_min),
        is_late=is_late,
    )
    db.add(entry)
    streak = await streaks_service.bump_streak(db, athlete_id, StreakType.rpe, data.date)
    await db.flush()
    await analytics_service.recalc_athlete(
        db, athlete_id, end_date=max(data.date, date.today()), commit=False
    )
    await db.commit()
    await db.refresh(entry)
    return entry, streak


async def get_history(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[RpeEntry]:
    rows = await db.execute(
        select(RpeEntry)
        .where(RpeEntry.athlete_id == athlete_id, RpeEntry.date >= date_from, RpeEntry.date <= date_to)
        .order_by(RpeEntry.date.desc(), RpeEntry.created_at.desc())
    )
    return list(rows.scalars())
