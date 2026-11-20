"""One timeline for the roster, athlete state and 90-day summary."""

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.availability import DIRECTIONS, Direction, effective_status
from app.core.calculations import availability_percent
from app.models.availability import AvailabilityBaseline, AvailabilityChange, AvailabilityRecord
from app.models.enums import AvailabilityStatus
from app.models.user import User
from app.schemas.availability import AvailabilityOut, AvailabilitySummaryOut


@dataclass
class Timeline:
    athlete_id: uuid.UUID
    baseline: AvailabilityBaseline | None = None
    changes: list[AvailabilityChange] = field(default_factory=list)
    legacy: list[AvailabilityRecord] = field(default_factory=list)

    def directions(self, day: date) -> dict[Direction, AvailabilityChange | None]:
        return {
            direction: next(
                (c for c in reversed(self.changes) if c.direction == direction and c.date <= day), None
            )
            for direction in DIRECTIONS
        }

    def status(self, day: date) -> AvailabilityStatus | None:
        if self.baseline and day >= self.baseline.start_date:
            rows = self.directions(day)
            return AvailabilityStatus(
                effective_status(
                    rows["medical"].status if rows["medical"] else "full",
                    rows["coaching"].status if rows["coaching"] else "full",
                )
            )
        row = next((r for r in reversed(self.legacy) if r.date <= day), None)
        return AvailabilityStatus(row.status) if row else None

    def summary(self, today: date) -> AvailabilitySummaryOut:
        counts = dict.fromkeys(AvailabilityStatus, 0)
        for offset in range(90):
            value = self.status(today - timedelta(days=offset))
            if value is not None:
                counts[value] += 1
        total = sum(counts.values())
        return AvailabilitySummaryOut(
            athlete_id=self.athlete_id,
            window_days=90,
            tracked_days=total,
            full_days=counts[AvailabilityStatus.full],
            modified_days=counts[AvailabilityStatus.modified],
            unavailable_days=counts[AvailabilityStatus.unavailable],
            availability_percent=availability_percent(counts[AvailabilityStatus.full], total),
        )

    def history(self, date_from: date, date_to: date) -> list[AvailabilityOut]:
        days = {r.date for r in self.legacy} | {c.date for c in self.changes}
        result = []
        for day in sorted(d for d in days if date_from <= d <= date_to):
            if not self.baseline or day < self.baseline.start_date:
                row = next(r for r in self.legacy if r.date == day)
                result.append(AvailabilityOut.model_validate(row))
                continue
            candidates = [c for c in self.directions(day).values() if c and c.status == self.status(day)]
            if candidates:
                change = max(candidates, key=lambda c: c.version)
                result.append(
                    AvailabilityOut(
                        id=change.id,
                        athlete_id=self.athlete_id,
                        date=day,
                        status=self.status(day),
                        set_by=change.actor_id,
                    )
                )
        return result


async def load_timelines(db: AsyncSession, athlete_ids: list[uuid.UUID]) -> dict[uuid.UUID, Timeline]:
    timelines = {athlete_id: Timeline(athlete_id) for athlete_id in athlete_ids}
    if not athlete_ids:
        return timelines
    baselines = await db.scalars(
        select(AvailabilityBaseline)
        .join(
            User, (User.id == AvailabilityBaseline.athlete_id) & (User.org_id == AvailabilityBaseline.org_id)
        )
        .where(AvailabilityBaseline.athlete_id.in_(athlete_ids))
    )
    for baseline in baselines:
        timelines[baseline.athlete_id].baseline = baseline
    changes = await db.scalars(
        select(AvailabilityChange)
        .join(User, (User.id == AvailabilityChange.athlete_id) & (User.org_id == AvailabilityChange.org_id))
        .where(AvailabilityChange.athlete_id.in_(athlete_ids))
        .order_by(AvailabilityChange.date, AvailabilityChange.version)
    )
    for change in changes:
        timelines[change.athlete_id].changes.append(change)
    legacy = await db.scalars(
        select(AvailabilityRecord)
        .where(AvailabilityRecord.athlete_id.in_(athlete_ids))
        .order_by(AvailabilityRecord.date)
    )
    for record in legacy:
        timelines[record.athlete_id].legacy.append(record)
    return timelines
