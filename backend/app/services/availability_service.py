"""Availability: статус дня + расчёт за 90 дней (раздел 6.5 ТЗ).

Статус дня наследуется от последнего установленного.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.calculations import availability_percent
from app.models.availability import AvailabilityRecord
from app.models.enums import AvailabilityStatus
from app.schemas.availability import AvailabilitySummaryOut
from app.services import audit_service

WINDOW_DAYS = 90


async def set_status(
    db: AsyncSession,
    actor_id: uuid.UUID,
    athlete_id: uuid.UUID,
    day: date,
    new_status: AvailabilityStatus,
) -> AvailabilityRecord:
    row = await db.execute(
        select(AvailabilityRecord).where(
            AvailabilityRecord.athlete_id == athlete_id, AvailabilityRecord.date == day
        )
    )
    record = row.scalar_one_or_none()
    if record is None:
        record = AvailabilityRecord(athlete_id=athlete_id, date=day, status=new_status, set_by=actor_id)
        db.add(record)
    else:
        record.status = new_status
        record.set_by = actor_id
    audit_service.log(
        db,
        actor_id,
        "availability.set",
        "availability",
        athlete_id,
        {"date": day.isoformat(), "status": new_status.value},
    )
    await db.commit()
    await db.refresh(record)
    return record


async def get_history(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[AvailabilityRecord]:
    rows = await db.execute(
        select(AvailabilityRecord)
        .where(
            AvailabilityRecord.athlete_id == athlete_id,
            AvailabilityRecord.date >= date_from,
            AvailabilityRecord.date <= date_to,
        )
        .order_by(AvailabilityRecord.date)
    )
    return list(rows.scalars())


async def current_status(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> AvailabilityStatus | None:
    """Статус на день = последний установленный не позже этого дня."""
    row = await db.execute(
        select(AvailabilityRecord.status)
        .where(AvailabilityRecord.athlete_id == athlete_id, AvailabilityRecord.date <= day)
        .order_by(AvailabilityRecord.date.desc())
        .limit(1)
    )
    value = row.scalar_one_or_none()
    return AvailabilityStatus(value) if value else None


async def summary_90d(db: AsyncSession, athlete_id: uuid.UUID, today: date) -> AvailabilitySummaryOut:
    """Каждый день окна получает статус наследованием; дни до первой записи — без статуса."""
    window_start = today - timedelta(days=WINDOW_DAYS - 1)
    rows = await db.execute(
        select(AvailabilityRecord.date, AvailabilityRecord.status)
        .where(AvailabilityRecord.athlete_id == athlete_id, AvailabilityRecord.date <= today)
        .order_by(AvailabilityRecord.date)
    )
    records = list(rows)

    counts = {status: 0 for status in AvailabilityStatus}
    idx = 0
    current: AvailabilityStatus | None = None
    day = window_start
    # Прокручиваем записи до начала окна, чтобы знать унаследованный статус
    while idx < len(records) and records[idx][0] < window_start:
        current = AvailabilityStatus(records[idx][1])
        idx += 1
    while day <= today:
        while idx < len(records) and records[idx][0] == day:
            current = AvailabilityStatus(records[idx][1])
            idx += 1
        if current is not None:
            counts[current] += 1
        day += timedelta(days=1)

    total = sum(counts.values())
    return AvailabilitySummaryOut(
        athlete_id=athlete_id,
        window_days=WINDOW_DAYS,
        full_days=counts[AvailabilityStatus.full],
        modified_days=counts[AvailabilityStatus.modified],
        unavailable_days=counts[AvailabilityStatus.unavailable],
        availability_percent=availability_percent(counts[AvailabilityStatus.full], total),
    )
