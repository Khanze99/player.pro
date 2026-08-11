"""Тренерский дашборд: Squad Status, командная сводка, травмы (раздел 3.2 ТЗ).

Читает предрасчитанную DailyMetric — дашборд до ~40 игроков за < 2 с (НФТ).
Все запросы батчевые по составу: N+1 недопустим, иначе НФТ не держится.
"""

import uuid
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import calculations as calc
from app.models.availability import AvailabilityRecord
from app.models.enums import (
    AttendanceStatus,
    AvailabilityStatus,
    InjuryStatus,
    TeamRole,
)
from app.models.event import Attendance, Event
from app.models.injury import InjuryRecord
from app.models.metric import DailyMetric
from app.models.rpe import RpeEntry
from app.models.team import Team, TeamMembership
from app.models.user import AthleteProfile, User, display_name
from app.models.wellness import WellnessEntry
from app.schemas.dashboard import (
    DashboardEventOut,
    InjuryHotspotOut,
    MetricGaugeOut,
    SquadPlayerOut,
    SquadStatusOut,
    TeamAlertOut,
    TeamInjuriesOut,
    TeamInjuryOut,
    TeamSummaryOut,
    WellnessReportOut,
)
from app.services import availability_service

LOAD_WINDOW_DAYS = 7
INJURY_WINDOW_DAYS = 90
EVENTS_LIMIT = 5
PAIN_THRESHOLD = 7  # soreness >= 7 считаем «есть боль» для утреннего отчёта


async def _team_athletes(db: AsyncSession, team_id: uuid.UUID) -> list[tuple[uuid.UUID, str]]:
    rows = await db.execute(
        select(User.id, User.last_name, User.first_name)
        .join(TeamMembership, TeamMembership.user_id == User.id)
        .where(TeamMembership.team_id == team_id, TeamMembership.team_role == TeamRole.athlete)
        .order_by(User.last_name, User.first_name)
    )
    return [(athlete_id, display_name(last, first)) for athlete_id, last, first in rows]


async def _current_availability(
    db: AsyncSession, athlete_ids: list[uuid.UUID], day: date
) -> dict[uuid.UUID, AvailabilityStatus]:
    """Статус дня наследуется от последней записи не позже day."""
    result: dict[uuid.UUID, AvailabilityStatus] = {}
    rows = await db.execute(
        select(AvailabilityRecord.athlete_id, AvailabilityRecord.status)
        .where(AvailabilityRecord.athlete_id.in_(athlete_ids), AvailabilityRecord.date <= day)
        .order_by(AvailabilityRecord.athlete_id, AvailabilityRecord.date)
    )
    for athlete_id, status_value in rows:
        result[athlete_id] = AvailabilityStatus(status_value)  # последняя по дате перезапишет
    return result


async def _active_injuries(db: AsyncSession, athlete_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    rows = await db.execute(
        select(InjuryRecord.athlete_id.distinct()).where(
            InjuryRecord.athlete_id.in_(athlete_ids), InjuryRecord.status == InjuryStatus.active
        )
    )
    return set(rows.scalars())


async def _window_metrics(
    db: AsyncSession, athlete_ids: list[uuid.UUID], day: date, days: int
) -> dict[uuid.UUID, tuple[float, float | None]]:
    """Суммарная нагрузка и средний перфоманс за окно, по игрокам."""
    window_start = day - timedelta(days=days - 1)
    rows = await db.execute(
        select(
            DailyMetric.athlete_id,
            func.sum(DailyMetric.daily_load),
            func.avg(DailyMetric.daily_performance),
        )
        .where(
            DailyMetric.athlete_id.in_(athlete_ids),
            DailyMetric.date >= window_start,
            DailyMetric.date <= day,
        )
        .group_by(DailyMetric.athlete_id)
    )
    return {
        athlete_id: (float(total or 0), float(avg) if avg is not None else None)
        for athlete_id, total, avg in rows
    }


async def squad_status(db: AsyncSession, team_id: uuid.UUID, day: date) -> SquadStatusOut:
    athletes = await _team_athletes(db, team_id)
    athlete_ids = [athlete_id for athlete_id, _ in athletes]
    if not athlete_ids:
        return SquadStatusOut(team_id=team_id, date=day, players=[])

    metrics_rows = await db.execute(
        select(DailyMetric).where(DailyMetric.athlete_id.in_(athlete_ids), DailyMetric.date == day)
    )
    metrics = {m.athlete_id: m for m in metrics_rows.scalars()}

    positions_rows = await db.execute(
        select(AthleteProfile.user_id, AthleteProfile.position).where(AthleteProfile.user_id.in_(athlete_ids))
    )
    positions = dict(positions_rows.all())

    availability = await _current_availability(db, athlete_ids, day)
    injured = await _active_injuries(db, athlete_ids)
    window = await _window_metrics(db, athlete_ids, day, LOAD_WINDOW_DAYS)

    availability_pct: dict[uuid.UUID, float | None] = {}
    for athlete_id in athlete_ids:
        summary = await availability_service.summary_90d(db, athlete_id, day)
        availability_pct[athlete_id] = summary.availability_percent

    players = []
    for athlete_id, name in athletes:
        metric = metrics.get(athlete_id)
        load_7d, performance_7d = window.get(athlete_id, (0.0, None))
        players.append(
            SquadPlayerOut(
                athlete_id=athlete_id,
                name=name,
                position=positions.get(athlete_id),
                readiness=metric.readiness if metric else None,
                readiness_zone=metric.readiness_zone if metric else None,
                acwr=metric.acwr if metric else None,
                load_zone=metric.load_zone if metric else calc.NO_DATA,
                daily_load=metric.daily_load if metric else 0.0,
                load_7d=load_7d,
                performance_7d=performance_7d,
                availability=availability.get(athlete_id),
                availability_percent=availability_pct.get(athlete_id),
                wellness_filled=bool(metric and metric.readiness is not None),
                active_injury=athlete_id in injured,
                hr_flag=bool(metric and metric.hr_flag),
            )
        )

    # Красные — наверх: сортировка по риску
    zone_rank = {"red": 0, "yellow": 1, None: 2, "green": 3}
    players.sort(
        key=lambda p: (zone_rank.get(p.readiness_zone, 2), p.readiness if p.readiness is not None else 101)
    )
    return SquadStatusOut(team_id=team_id, date=day, players=players)


def _gauge(
    values: list[float], total: int, scale_max: float, zone_of, distribution: dict[str, int]
) -> MetricGaugeOut:
    average = calc.mean(values)
    return MetricGaugeOut(
        value=average,
        scale_max=scale_max,
        zone=zone_of(average),
        covered=len(values),
        total=total,
        distribution=distribution,
    )


async def _event_stats(
    db: AsyncSession, events: list[Event], athlete_ids: list[uuid.UUID]
) -> list[DashboardEventOut]:
    """Посещаемость и RPE по каждому событию — одним запросом на метрику."""
    if not events:
        return []
    event_ids = [event.id for event in events]

    attendance_rows = await db.execute(
        select(Attendance.event_id, Attendance.status, func.count())
        .where(Attendance.event_id.in_(event_ids))
        .group_by(Attendance.event_id, Attendance.status)
    )
    attendance: dict[uuid.UUID, dict[str, int]] = {}
    for event_id, status_value, count in attendance_rows:
        attendance.setdefault(event_id, {})[str(status_value)] = count

    rpe_rows = await db.execute(
        select(
            RpeEntry.event_id,
            func.count(),
            func.avg(RpeEntry.exertion),
            func.avg(RpeEntry.session_load),
        )
        .where(RpeEntry.event_id.in_(event_ids), RpeEntry.athlete_id.in_(athlete_ids))
        .group_by(RpeEntry.event_id)
    )
    rpe = {
        event_id: (count, float(avg_exertion), float(avg_load))
        for event_id, count, avg_exertion, avg_load in rpe_rows
    }

    result = []
    for event in events:
        counts = attendance.get(event.id, {})
        filled, avg_exertion, avg_load = rpe.get(event.id, (0, None, None))
        result.append(
            DashboardEventOut(
                id=event.id,
                type=event.type,
                title=event.title,
                planned_start=event.planned_start,
                planned_duration_min=event.planned_duration_min,
                present=counts.get(AttendanceStatus.present.value, 0),
                absent=counts.get(AttendanceStatus.absent.value, 0),
                rpe_filled=filled,
                avg_exertion=avg_exertion,
                avg_load=avg_load,
            )
        )
    return result


def _alerts(players: list[SquadPlayerOut]) -> list[TeamAlertOut]:
    """Командный отчёт: у кого что не так. Коды причин — текст подставляет клиент."""
    alerts: list[TeamAlertOut] = []
    for player in players:
        reasons: list[str] = []
        if player.readiness_zone == "red":
            reasons.append("low_readiness")
        if player.load_zone == "high_risk":
            reasons.append("high_load")
        elif player.load_zone == "overreaching":
            reasons.append("rising_load")
        elif player.load_zone == "undertraining":
            reasons.append("undertraining")
        if player.active_injury:
            reasons.append("injury")
        if player.availability == AvailabilityStatus.unavailable:
            reasons.append("unavailable")
        if player.hr_flag:
            reasons.append("hr_flag")
        if not player.wellness_filled:
            reasons.append("no_survey")
        if not reasons:
            continue
        critical = {"low_readiness", "high_load", "injury", "unavailable"}
        alerts.append(
            TeamAlertOut(
                athlete_id=player.athlete_id,
                name=player.name,
                severity="risk" if critical & set(reasons) else "caution",
                reasons=reasons,
            )
        )
    alerts.sort(key=lambda a: (a.severity != "risk", -len(a.reasons), a.name))
    return alerts


async def team_summary(db: AsyncSession, team_id: uuid.UUID, day: date) -> TeamSummaryOut:
    team = await db.get(Team, team_id)
    team_name = team.name if team else ""
    squad = await squad_status(db, team_id, day)
    players = squad.players
    total = len(players)

    readiness_values = [float(p.readiness) for p in players if p.readiness is not None]
    load_values = [p.acwr for p in players if p.acwr is not None]
    performance_values = [p.performance_7d for p in players if p.performance_7d is not None]
    availability_values = [p.availability_percent for p in players if p.availability_percent is not None]

    readiness_gauge = _gauge(
        readiness_values,
        total,
        100,
        calc.readiness_zone,
        dict(Counter(p.readiness_zone or calc.NO_DATA for p in players)),
    )
    load_gauge = _gauge(
        load_values,
        total,
        2.0,
        calc.load_zone,
        dict(Counter(p.load_zone for p in players)),
    )
    performance_gauge = _gauge(
        performance_values,
        total,
        10,
        calc.performance_zone,
        dict(Counter(calc.performance_zone(p.performance_7d) for p in players)),
    )
    availability_gauge = _gauge(
        availability_values,
        total,
        100,
        calc.availability_zone,
        dict(Counter(calc.availability_zone(p.availability_percent) for p in players)),
    )

    # --- Утренний отчёт по опросам ---
    athlete_ids = [p.athlete_id for p in players]
    wellness_rows = await db.execute(
        select(WellnessEntry).where(
            WellnessEntry.athlete_id.in_(athlete_ids or [uuid.uuid4()]), WellnessEntry.date == day
        )
    )
    entries = list(wellness_rows.scalars())
    filled_ids = {entry.athlete_id for entry in entries}
    wellness = WellnessReportOut(
        filled=len(entries),
        total=total,
        avg_sleep_quality=calc.mean([float(e.sleep_quality) for e in entries]),
        avg_energy=calc.mean([float(e.energy) for e in entries]),
        avg_mood=calc.mean([float(e.mood) for e in entries]),
        avg_stress=calc.mean([float(e.stress) for e in entries]),
        avg_soreness=calc.mean([float(e.soreness) for e in entries]),
        avg_sleep_hours=calc.mean([float(e.sleep_hours) for e in entries if e.sleep_hours is not None]),
        with_pain=sum(1 for e in entries if e.soreness >= PAIN_THRESHOLD),
        with_injury_flag=sum(1 for e in entries if e.injury),
        with_symptom_flag=sum(1 for e in entries if e.symptom),
        missing=[p.name for p in players if p.athlete_id not in filled_ids],
    )

    # --- События: прошедшие и предстоящие ---
    boundary = datetime.combine(day, time.max, tzinfo=UTC)
    past_rows = await db.execute(
        select(Event)
        .where(Event.team_id == team_id, Event.planned_start <= boundary)
        .order_by(Event.planned_start.desc())
        .limit(EVENTS_LIMIT)
    )
    past = list(past_rows.scalars())
    upcoming_rows = await db.execute(
        select(Event)
        .where(Event.team_id == team_id, Event.planned_start > boundary)
        .order_by(Event.planned_start)
        .limit(EVENTS_LIMIT)
    )
    upcoming = list(upcoming_rows.scalars())

    return TeamSummaryOut(
        team_id=team_id,
        team_name=team_name,
        date=day,
        squad_size=total,
        readiness=readiness_gauge,
        load=load_gauge,
        performance=performance_gauge,
        availability=availability_gauge,
        wellness=wellness,
        past_events=await _event_stats(db, past, athlete_ids),
        upcoming_events=await _event_stats(db, upcoming, athlete_ids),
        alerts=_alerts(players),
    )


async def team_injuries(db: AsyncSession, team_id: uuid.UUID, day: date) -> TeamInjuriesOut:
    """Травмы (InjuryRecord) + болезни (флаг symptom в опросе) одним списком."""
    athletes = await _team_athletes(db, team_id)
    names = dict(athletes)
    athlete_ids = list(names)
    if not athlete_ids:
        return TeamInjuriesOut(
            team_id=team_id, date=day, window_days=INJURY_WINDOW_DAYS, active=[], recent=[], hotspots=[]
        )

    window_start = day - timedelta(days=INJURY_WINDOW_DAYS - 1)
    availability = await _current_availability(db, athlete_ids, day)

    injury_rows = await db.execute(
        select(InjuryRecord)
        .where(InjuryRecord.athlete_id.in_(athlete_ids), InjuryRecord.start_date >= window_start)
        .order_by(InjuryRecord.start_date.desc())
    )
    active: list[TeamInjuryOut] = []
    recent: list[TeamInjuryOut] = []
    for record in injury_rows.scalars():
        end = record.end_date or day
        item = TeamInjuryOut(
            kind="injury",
            id=record.id,
            athlete_id=record.athlete_id,
            athlete_name=names.get(record.athlete_id, ""),
            title=record.type,
            body_region=record.body_region,
            body_side=record.body_side,
            injury_type=record.injury_type,
            symptom_type=None,
            severity=record.severity,
            status=record.status,
            start_date=record.start_date,
            end_date=record.end_date,
            days_out=max(0, (end - record.start_date).days),
            availability=availability.get(record.athlete_id),
        )
        (active if record.status == InjuryStatus.active else recent).append(item)

    # Болезни: последняя запись опроса с symptom=True за окно, по игроку
    symptom_rows = await db.execute(
        select(WellnessEntry)
        .where(
            WellnessEntry.athlete_id.in_(athlete_ids),
            WellnessEntry.symptom.is_(True),
            WellnessEntry.date >= window_start,
            WellnessEntry.date <= day,
        )
        .order_by(WellnessEntry.athlete_id, WellnessEntry.date.desc())
    )
    seen: set[uuid.UUID] = set()
    for entry in symptom_rows.scalars():
        if entry.athlete_id in seen:
            continue
        seen.add(entry.athlete_id)
        item = TeamInjuryOut(
            kind="illness",
            id=entry.id,
            athlete_id=entry.athlete_id,
            athlete_name=names.get(entry.athlete_id, ""),
            title=entry.symptom_details or "",
            body_region=None,
            body_side=None,
            injury_type=None,
            symptom_type=entry.symptom_type,
            severity=None,
            status=None,
            start_date=entry.date,
            end_date=None,
            days_out=(day - entry.date).days,
            availability=availability.get(entry.athlete_id),
        )
        # Симптом свежий (сегодня/вчера) — считаем действующим
        (active if (day - entry.date).days <= 1 else recent).append(item)

    active.sort(key=lambda i: i.start_date, reverse=True)
    recent.sort(key=lambda i: i.start_date, reverse=True)

    hotspot_counter = Counter(item.body_region for item in [*active, *recent] if item.body_region is not None)
    hotspots = [
        InjuryHotspotOut(body_region=region, count=count) for region, count in hotspot_counter.most_common()
    ]

    return TeamInjuriesOut(
        team_id=team_id,
        date=day,
        window_days=INJURY_WINDOW_DAYS,
        active=active,
        recent=recent,
        hotspots=hotspots,
    )
