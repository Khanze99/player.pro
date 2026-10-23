"""Ежедневный wellness-опрос: запись, live-расчёт Readiness, стрик."""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StreakType
from app.models.pain_point import PainPoint
from app.models.recovery_method import RecoveryMethodLog
from app.models.user import AthleteProfile
from app.models.wellness import WellnessEntry
from app.schemas.wellness import WellnessCreateIn
from app.services import analytics_service, cycle_service, streaks_service


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
    recovery_methods = payload.pop("recovery_methods", [])
    # Цикл не хранится в WellnessEntry (см. схему) — переложим отдельно, в cycle_logs.
    period_day = payload.pop("period_day", None)
    period_pain_level = payload.pop("period_pain_level", None)
    entry = WellnessEntry(athlete_id=athlete_id, **payload)
    # Карта боли — деталь; на Readiness не влияет (см. analytics: score считает soreness).
    entry.pain_points = [PainPoint(**pp) for pp in pain_points]
    # set() — защита от дублей с клиента (чекбоксы и так не дадут выбрать дважды,
    # но дёшево не доверять фронту), на Readiness тоже не влияет.
    entry.recovery_methods = [RecoveryMethodLog(method=m) for m in set(recovery_methods)]
    db.add(entry)
    streak = await streaks_service.bump_streak(db, athlete_id, StreakType.wellness, data.date)
    await db.flush()
    if data.weight_kg is not None:
        await _sync_latest_weight(db, athlete_id, data.date, data.weight_kg)
    await db.commit()
    await cycle_service.record_from_wellness(db, athlete_id, data.date, period_day, period_pain_level)
    # expire_on_commit=False → объект и загруженная коллекция pain_points остаются доступны
    # DailyMetric пересчитывает Celery-задача после коммита (ночной прогон — страховка).
    analytics_service.enqueue_recalc_athlete(athlete_id, max(data.date, date.today()))
    return entry, streak


async def _sync_latest_weight(
    db: AsyncSession, athlete_id: uuid.UUID, entry_date: date, weight_kg: Decimal
) -> None:
    """AthleteProfile.weight_kg держит «последнее известное» (docs/plan-weight-tracking.md).

    Синхронизируем только если entry_date — самая свежая дата с весом у этого
    игрока: иначе задним числом заполненный старый день перетирал бы профиль
    более свежим значением из будущего (относительно того дня) на старое.
    """
    latest_date = (
        await db.execute(
            select(func.max(WellnessEntry.date)).where(
                WellnessEntry.athlete_id == athlete_id, WellnessEntry.weight_kg.isnot(None)
            )
        )
    ).scalar_one_or_none()
    if latest_date is not None and latest_date > entry_date:
        return

    profile = await db.get(AthleteProfile, athlete_id)
    if profile is None:
        db.add(AthleteProfile(user_id=athlete_id, weight_kg=weight_kg))
    else:
        profile.weight_kg = weight_kg


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
