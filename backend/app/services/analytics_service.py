"""Расчёт DailyMetric: daily load → EWMA → ACWR → Readiness (раздел 6 ТЗ).

Пересчёт идемпотентен: перезапуск за любой день не создаёт дублей.
День без событий = 0 AU (не пропуск) — важно для EWMA.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import calculations as calc
from app.models.metric import DailyMetric
from app.models.rpe import RpeEntry
from app.models.user import AthleteProfile
from app.models.wellness import WellnessEntry


async def _first_data_date(db: AsyncSession, athlete_id: uuid.UUID) -> date | None:
    rpe_min = (
        await db.execute(select(func.min(RpeEntry.date)).where(RpeEntry.athlete_id == athlete_id))
    ).scalar()
    wellness_min = (
        await db.execute(select(func.min(WellnessEntry.date)).where(WellnessEntry.athlete_id == athlete_id))
    ).scalar()
    dates = [d for d in (rpe_min, wellness_min) if d is not None]
    return min(dates) if dates else None


async def recalc_athlete(
    db: AsyncSession, athlete_id: uuid.UUID, end_date: date | None = None, commit: bool = True
) -> int:
    """Пересчитывает метрики игрока с первого дня данных по end_date. Возвращает число дней."""
    end_date = end_date or date.today()
    start = await _first_data_date(db, athlete_id)
    if start is None or start > end_date:
        return 0

    loads_rows = await db.execute(
        select(RpeEntry.date, func.sum(RpeEntry.session_load))
        .where(RpeEntry.athlete_id == athlete_id, RpeEntry.date <= end_date)
        .group_by(RpeEntry.date)
    )
    loads: dict[date, float] = {d: float(total) for d, total in loads_rows}

    wellness_rows = await db.execute(
        select(WellnessEntry).where(WellnessEntry.athlete_id == athlete_id, WellnessEntry.date <= end_date)
    )
    wellness: dict[date, WellnessEntry] = {w.date: w for w in wellness_rows.scalars()}

    profile = await db.get(AthleteProfile, athlete_id)
    baseline_hr = profile.baseline_resting_hr if profile else None

    existing_rows = await db.execute(
        select(DailyMetric).where(DailyMetric.athlete_id == athlete_id, DailyMetric.date <= end_date)
    )
    existing: dict[date, DailyMetric] = {m.date: m for m in existing_rows.scalars()}

    ewma_acute: float | None = None
    ewma_chronic: float | None = None
    day = start
    days = 0
    while day <= end_date:
        load = loads.get(day, 0.0)
        ewma_acute = calc.ewma_next(load, ewma_acute, calc.LAMBDA_ACUTE)
        ewma_chronic = calc.ewma_next(load, ewma_chronic, calc.LAMBDA_CHRONIC)
        ratio = calc.acwr(ewma_acute, ewma_chronic)

        readiness_score: int | None = None
        readiness_zone: str | None = None
        hr_flag = False
        unavailable_flag = False
        entry = wellness.get(day)
        if entry is not None:
            result = calc.readiness(
                calc.ReadinessInput(
                    mood=entry.mood,
                    energy=entry.energy,
                    sleep_quality=entry.sleep_quality,
                    stress=entry.stress,
                    soreness=entry.soreness,
                    resting_hr=entry.resting_hr,
                    baseline_resting_hr=baseline_hr,
                    injury=entry.injury,
                    symptom=entry.symptom,
                )
            )
            readiness_score = result.score
            readiness_zone = result.zone
            hr_flag = result.hr_flag
            unavailable_flag = result.unavailable_flag

        metric = existing.get(day)
        if metric is None:
            metric = DailyMetric(athlete_id=athlete_id, date=day)
            db.add(metric)
        metric.daily_load = load
        metric.ewma_acute = ewma_acute
        metric.ewma_chronic = ewma_chronic
        metric.acwr = ratio
        metric.load_zone = calc.load_zone(ratio)
        metric.readiness = readiness_score
        metric.readiness_zone = readiness_zone
        metric.hr_flag = hr_flag
        metric.unavailable_flag = unavailable_flag

        day += timedelta(days=1)
        days += 1

    if commit:
        await db.commit()
    return days


async def recalc_all(db: AsyncSession, end_date: date | None = None) -> int:
    """Ночной пересчёт: все игроки, у которых есть данные."""
    athlete_ids = {
        *(await db.execute(select(RpeEntry.athlete_id).distinct())).scalars(),
        *(await db.execute(select(WellnessEntry.athlete_id).distinct())).scalars(),
    }
    total = 0
    for athlete_id in athlete_ids:
        total += await recalc_athlete(db, athlete_id, end_date=end_date, commit=False)
    await db.commit()
    return total


async def get_metrics(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[DailyMetric]:
    rows = await db.execute(
        select(DailyMetric)
        .where(
            DailyMetric.athlete_id == athlete_id,
            DailyMetric.date >= date_from,
            DailyMetric.date <= date_to,
        )
        .order_by(DailyMetric.date)
    )
    return list(rows.scalars())
