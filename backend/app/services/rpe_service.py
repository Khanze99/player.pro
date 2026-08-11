"""RPE после нагрузки: session_load = RPE × минуты, окно ввода 24 ч (раздел 3.1 ТЗ).

Оценка привязывается к сессии расписания: одна запись на событие, и только после
его окончания. Без событий в дне остаётся свободный ввод — личный режим (раздел 2.1 ТЗ).
"""

import uuid
from datetime import UTC, date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.calculations import session_load
from app.models.enums import StreakType
from app.models.event import Event
from app.models.rpe import RpeEntry
from app.models.team import TeamMembership
from app.schemas.rpe import RpeCreateIn, RpeSessionOut
from app.services import analytics_service, events_service, streaks_service

LATE_WINDOW = timedelta(hours=24)


def _aware(value: datetime) -> datetime:
    """Postgres может вернуть naive-datetime — сравниваем всё в UTC."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _session_end(event: Event) -> datetime:
    return _aware(event.planned_start) + timedelta(minutes=event.planned_duration_min)


async def _resolve_session(db: AsyncSession, athlete_id: uuid.UUID, event_id: uuid.UUID) -> Event:
    """Событие должно быть доступно игроку, уже закончиться и ещё не иметь оценки."""
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")

    if event.team_id is not None:
        membership = await db.get(TeamMembership, (athlete_id, event.team_id))
        if membership is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")
    elif event.created_by != athlete_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие не найдено")

    if _session_end(event) > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Оценить нагрузку можно после окончания тренировки",
        )

    duplicate = await db.execute(
        select(RpeEntry.id).where(RpeEntry.athlete_id == athlete_id, RpeEntry.event_id == event_id)
    )
    if duplicate.first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Эта тренировка уже оценена")
    return event


async def day_sessions(
    db: AsyncSession, athlete_id: uuid.UUID, day: date, tz_offset_min: int = 0
) -> list[RpeSessionOut]:
    """Сессии дня для карточки RPE: что уже закончилось и что уже оценено.

    День — локальный для игрока: tz_offset_min задаёт смещение к востоку от UTC
    (MSK → 180). Иначе после полуночи в UTC+3 в «сегодня» попадали бы вчерашние
    тренировки, а вечерние — уезжали в завтра.
    """
    day_start = datetime.combine(day, time.min, tzinfo=UTC) - timedelta(minutes=tz_offset_min)
    events = await events_service.list_my_events(
        db, athlete_id, day_start, day_start + timedelta(days=1) - timedelta(microseconds=1)
    )
    if not events:
        return []

    rated = await db.execute(
        select(RpeEntry.event_id).where(
            RpeEntry.athlete_id == athlete_id,
            RpeEntry.event_id.in_([event.id for event in events]),
        )
    )
    rated_ids = set(rated.scalars())

    now = datetime.now(UTC)
    return [
        RpeSessionOut(
            event_id=event.id,
            type=event.type,
            title=event.title,
            planned_start=_aware(event.planned_start),
            planned_duration_min=event.planned_duration_min,
            ends_at=_session_end(event),
            finished=_session_end(event) <= now,
            rpe_submitted=event.id in rated_ids,
        )
        for event in events
    ]


async def create_entry(db: AsyncSession, athlete_id: uuid.UUID, data: RpeCreateIn) -> tuple[RpeEntry, int]:
    is_late = False
    if data.event_id is not None:
        event = await _resolve_session(db, athlete_id, data.event_id)
        is_late = datetime.now(UTC) > _session_end(event) + LATE_WINDOW

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
