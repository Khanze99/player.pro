"""Стрики заполнения опросов/RPE (раздел 3.1 ТЗ)."""

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StreakType
from app.models.metric import Streak


async def bump_streak(
    db: AsyncSession, athlete_id: uuid.UUID, streak_type: StreakType, entry_date: date
) -> int:
    """Обновляет стрик по факту записи за entry_date; идемпотентно для одного дня. Без commit."""
    row = await db.execute(select(Streak).where(Streak.athlete_id == athlete_id, Streak.type == streak_type))
    streak = row.scalar_one_or_none()
    if streak is None:
        streak = Streak(athlete_id=athlete_id, type=streak_type, count=1, last_date=entry_date)
        db.add(streak)
        return 1

    if streak.last_date is None or entry_date > streak.last_date + timedelta(days=1):
        streak.count = 1
    elif entry_date == streak.last_date + timedelta(days=1):
        streak.count += 1
    # entry_date <= last_date (повтор/задним числом) — стрик не меняем

    if streak.last_date is None or entry_date > streak.last_date:
        streak.last_date = entry_date
    return streak.count


async def get_streaks(db: AsyncSession, athlete_id: uuid.UUID) -> list[Streak]:
    row = await db.execute(select(Streak).where(Streak.athlete_id == athlete_id))
    return list(row.scalars())
