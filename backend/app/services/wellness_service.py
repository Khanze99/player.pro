"""Ежедневный wellness-опрос: запись, live-расчёт Readiness, стрик."""

import uuid
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StreakType
from app.models.pain_point import PainPoint
from app.models.wellness import WellnessEntry
from app.schemas.wellness import WellnessCreateIn
from app.services import analytics_service, streaks_service


async def create_entry(
    db: AsyncSession, athlete_id: uuid.UUID, data: WellnessCreateIn
) -> tuple[WellnessEntry, int]:
    """Возвращает (запись, текущий стрик). Readiness пересчитывается сразу."""
    duplicate = await db.execute(
        select(WellnessEntry.id).where(
            WellnessEntry.athlete_id == athlete_id, WellnessEntry.date == data.date
        )
    )
    if duplicate.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Опрос за этот день уже заполнен")

    payload = data.model_dump()
    pain_points = payload.pop("pain_points", [])
    entry = WellnessEntry(athlete_id=athlete_id, **payload)
    # Карта боли — деталь; на Readiness не влияет (см. analytics: score считает soreness).
    entry.pain_points = [PainPoint(**pp) for pp in pain_points]
    db.add(entry)
    streak = await streaks_service.bump_streak(db, athlete_id, StreakType.wellness, data.date)
    await db.flush()
    # Live-обновление DailyMetric (ночной пересчёт — страховка)
    await analytics_service.recalc_athlete(
        db, athlete_id, end_date=max(data.date, date.today()), commit=False
    )
    await db.commit()
    # expire_on_commit=False → объект и загруженная коллекция pain_points остаются доступны
    return entry, streak


async def get_history(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[WellnessEntry]:
    rows = await db.execute(
        select(WellnessEntry)
        .where(
            WellnessEntry.athlete_id == athlete_id,
            WellnessEntry.date >= date_from,
            WellnessEntry.date <= date_to,
        )
        .order_by(WellnessEntry.date.desc())
    )
    return list(rows.scalars())
