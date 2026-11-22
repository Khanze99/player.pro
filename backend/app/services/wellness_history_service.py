"""Read-only wellness history: safe numeric projection and current-team aggregate."""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import authz
from app.models.cycle import CycleLog
from app.models.enums import EventType, Sex, TeamRole, UserStatus
from app.models.event import Event
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import AthleteProfile, User
from app.models.wellness import WellnessEntry
from app.schemas.wellness_history import (
    WellnessHistoryCycleOut,
    WellnessHistoryDayOut,
    WellnessHistoryEventOut,
    WellnessHistoryOut,
    WellnessTeamAverageOut,
    WellnessValuesOut,
)
from app.services.events_service import participant_of

VALUE_KEYS = ("sleep_quality", "energy", "soreness", "stress", "mood")
MAX_WINDOW_DAYS = 90
CONTEXT_DAYS = 3


class InvalidWellnessPeriodError(ValueError):
    pass


def _period(date_from: date | None, date_to: date | None, today: date) -> tuple[date, date]:
    end = date_to or today
    start = date_from or end - timedelta(days=6)
    if start < date(1970, 1, 1) or not start <= end <= today or (end - start).days >= MAX_WINDOW_DAYS:
        raise InvalidWellnessPeriodError(
            "Выберите период от 1 до 90 дней, не раньше 1970 года и не позже сегодня"
        )
    return start, end


def _values(row: RowMapping) -> WellnessValuesOut:
    return WellnessValuesOut(**{key: row[key] for key in VALUE_KEYS})


async def _athlete_values(
    db: AsyncSession, athlete_id: uuid.UUID, start: date, end: date
) -> dict[date, RowMapping]:
    rows = await db.execute(
        select(
            WellnessEntry.date, WellnessEntry.created_at, *(getattr(WellnessEntry, key) for key in VALUE_KEYS)
        ).where(WellnessEntry.athlete_id == athlete_id, WellnessEntry.date.between(start, end))
    )
    return {row["date"]: row for row in rows.mappings()}


async def _team_values(
    db: AsyncSession, team: Team, athlete_id: uuid.UUID, start: date, end: date
) -> dict[date, RowMapping]:
    rows = await db.execute(
        select(
            WellnessEntry.date,
            func.count(WellnessEntry.id).label("count"),
            *(func.avg(getattr(WellnessEntry, key)).label(key) for key in VALUE_KEYS),
        )
        .join(User, User.id == WellnessEntry.athlete_id)
        .join(TeamMembership, TeamMembership.user_id == User.id)
        .where(
            User.org_id == team.org_id,
            User.status == UserStatus.active,
            TeamMembership.team_id == team.id,
            TeamMembership.team_role == TeamRole.athlete,
            WellnessEntry.athlete_id != athlete_id,
            WellnessEntry.date.between(start, end),
        )
        .group_by(WellnessEntry.date)
    )
    return {row["date"]: row for row in rows.mappings()}


async def _events(
    db: AsyncSession, team_id: uuid.UUID, athlete_id: uuid.UUID, start: date, end: date, zone: ZoneInfo
) -> dict[date, list[WellnessHistoryEventOut]]:
    lower = datetime.combine(start, time.min, zone).astimezone(UTC)
    upper = datetime.combine(end + timedelta(days=1), time.min, zone).astimezone(UTC)
    rows = await db.execute(
        select(Event.id, Event.type, Event.title, Event.planned_start)
        .where(
            Event.team_id == team_id,
            Event.type.in_([EventType.training, EventType.match]),
            Event.planned_start >= lower,
            Event.planned_start < upper,
            participant_of(athlete_id),
        )
        .order_by(Event.planned_start, Event.id)
    )
    grouped: dict[date, list[WellnessHistoryEventOut]] = defaultdict(list)
    for row in rows.mappings():
        day = row["planned_start"].astimezone(zone).date()
        grouped[day].append(WellnessHistoryEventOut(**row, date=day))
    return grouped


def _days(
    start: date,
    end: date,
    own: dict[date, RowMapping],
    averages: dict[date, RowMapping],
    events: dict[date, list[WellnessHistoryEventOut]],
) -> list[WellnessHistoryDayOut]:
    result = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        answer, average = own.get(day), averages.get(day)
        result.append(
            WellnessHistoryDayOut(
                date=day,
                submitted_at=answer["created_at"] if answer else None,
                values=_values(answer) if answer else None,
                team_average=WellnessTeamAverageOut(values=_values(average), count=average["count"])
                if average
                else None,
                events=events.get(day, []),
            )
        )
    return result


async def _cycle_days(
    db: AsyncSession, viewer: User, team: Team, athlete_id: uuid.UUID, start: date, end: date
) -> WellnessHistoryCycleOut | None:
    if not settings.feature_cycle_enabled:
        return None
    sex = await db.scalar(select(AthleteProfile.sex).where(AthleteProfile.user_id == athlete_id))
    if sex != Sex.female or not await authz.can_view_team_cycle(db, viewer, team, athlete_id):
        return None
    dates = await db.scalars(
        select(CycleLog.date)
        .where(
            CycleLog.athlete_id == athlete_id,
            CycleLog.on_period.is_(True),
            CycleLog.date.between(start, end),
        )
        .order_by(CycleLog.date)
    )
    return WellnessHistoryCycleOut(period_days=list(dates))


async def get_history(
    db: AsyncSession,
    team: Team,
    athlete_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
    viewer: User,
) -> WellnessHistoryOut:
    timezone = await db.scalar(select(Organization.timezone).where(Organization.id == team.org_id)) or "UTC"
    zone = ZoneInfo(timezone)
    today = datetime.now(UTC).astimezone(zone).date()
    start, end = _period(date_from, date_to, today)
    context = start - timedelta(days=CONTEXT_DAYS)
    own = await _athlete_values(db, athlete_id, context, end)
    averages = await _team_values(db, team, athlete_id, context, end)
    events = await _events(db, team.id, athlete_id, context, end, zone)
    cycle = await _cycle_days(db, viewer, team, athlete_id, context, end)
    return WellnessHistoryOut(
        athlete_id=athlete_id,
        team_id=team.id,
        timezone=timezone,
        today=today,
        date_from=start,
        date_to=end,
        context_from=context,
        days=_days(context, end, own, averages, events),
        cycle=cycle,
        games=[
            event
            for day, items in events.items()
            if start <= day <= end
            for event in items
            if event.type == "match"
        ],
    )
