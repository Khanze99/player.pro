"""Squad Status — обзор состава на сегодня (раздел 3.2 ТЗ).

Читает предрасчитанную DailyMetric — дашборд до ~40 игроков за < 2 с (НФТ).
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.availability import AvailabilityRecord
from app.models.enums import AvailabilityStatus, InjuryStatus, TeamRole
from app.models.injury import InjuryRecord
from app.models.metric import DailyMetric
from app.models.team import TeamMembership
from app.models.user import User
from app.schemas.dashboard import SquadPlayerOut, SquadStatusOut


async def squad_status(db: AsyncSession, team_id: uuid.UUID, day: date) -> SquadStatusOut:
    athletes_rows = await db.execute(
        select(User.id, User.name)
        .join(TeamMembership, TeamMembership.user_id == User.id)
        .where(TeamMembership.team_id == team_id, TeamMembership.team_role == TeamRole.athlete)
        .order_by(User.name)
    )
    athletes = list(athletes_rows)
    athlete_ids = [athlete_id for athlete_id, _ in athletes]
    if not athlete_ids:
        return SquadStatusOut(team_id=team_id, date=day, players=[])

    metrics_rows = await db.execute(
        select(DailyMetric).where(DailyMetric.athlete_id.in_(athlete_ids), DailyMetric.date == day)
    )
    metrics = {m.athlete_id: m for m in metrics_rows.scalars()}

    # Availability: последняя запись не позже day для каждого игрока
    availability: dict[uuid.UUID, AvailabilityStatus] = {}
    availability_rows = await db.execute(
        select(AvailabilityRecord.athlete_id, AvailabilityRecord.status)
        .where(AvailabilityRecord.athlete_id.in_(athlete_ids), AvailabilityRecord.date <= day)
        .order_by(AvailabilityRecord.athlete_id, AvailabilityRecord.date)
    )
    for athlete_id, status_value in availability_rows:
        availability[athlete_id] = AvailabilityStatus(status_value)  # последняя по дате перезапишет

    injured_rows = await db.execute(
        select(InjuryRecord.athlete_id.distinct()).where(
            InjuryRecord.athlete_id.in_(athlete_ids), InjuryRecord.status == InjuryStatus.active
        )
    )
    injured = set(injured_rows.scalars())

    players = []
    for athlete_id, name in athletes:
        metric = metrics.get(athlete_id)
        players.append(
            SquadPlayerOut(
                athlete_id=athlete_id,
                name=name,
                readiness=metric.readiness if metric else None,
                readiness_zone=metric.readiness_zone if metric else None,
                acwr=metric.acwr if metric else None,
                load_zone=metric.load_zone if metric else "no_data",
                availability=availability.get(athlete_id),
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
