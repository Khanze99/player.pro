"""Тренерский дашборд: зоны агрегатов, сводка по команде, травмы и болезни."""

import uuid
from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.core import calculations as calc
from app.models.availability import AvailabilityRecord
from app.models.enums import (
    AvailabilityStatus,
    BodyRegion,
    BodySide,
    EventType,
    GlobalRole,
    InjurySeverity,
    InjuryStatus,
    InjuryType,
    SymptomType,
    TeamRole,
    UserStatus,
)
from app.models.event import Event
from app.models.injury import InjuryRecord
from app.models.organization import Organization
from app.models.rpe import RpeEntry
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.models.wellness import WellnessEntry
from app.services import analytics_service, dashboard_service

# ------------------------------------------------------------------ формулы


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (None, "no_data"),
        (100, "green"),
        (75, "green"),
        (74, "yellow"),
        (55, "yellow"),
        (54, "red"),
        (0, "red"),
    ],
)
def test_readiness_zone_boundaries(score, expected):
    assert calc.readiness_zone(score) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, "no_data"), (10, "green"), (7.0, "green"), (6.9, "yellow"), (5.0, "yellow"), (4.9, "red")],
)
def test_performance_zone_boundaries(value, expected):
    assert calc.performance_zone(value) == expected


@pytest.mark.parametrize(
    ("percent", "expected"),
    [(None, "no_data"), (100, "green"), (85, "green"), (84.9, "yellow"), (70, "yellow"), (69.9, "red")],
)
def test_availability_zone_boundaries(percent, expected):
    assert calc.availability_zone(percent) == expected


def test_mean_of_empty_is_none_not_zero():
    """Ноль и «нет данных» — разные вещи: бублик должен показать прочерк, а не 0."""
    assert calc.mean([]) is None
    assert calc.mean([1.0, 2.0, 6.0]) == 3.0


# ------------------------------------------------------------------ фикстуры


async def _team_with_athletes(db, count: int) -> tuple[uuid.UUID, list[uuid.UUID]]:
    org = Organization(name="Тест-клуб")
    db.add(org)
    await db.flush()
    team = Team(org_id=org.id, name="Основа")
    db.add(team)
    await db.flush()

    coach = User(
        org_id=org.id,
        last_name="Тренер",
        email=f"coach-{uuid.uuid4().hex[:8]}@test.com",
        global_role=GlobalRole.admin,
        status=UserStatus.active,
    )
    db.add(coach)
    await db.flush()
    db.add(TeamMembership(user_id=coach.id, team_id=team.id, team_role=TeamRole.head_coach))

    athlete_ids = []
    for index in range(count):
        athlete = User(
            org_id=org.id,
            last_name="Игрок",
            first_name=f"{index:02d}",
            email=f"a{index}-{uuid.uuid4().hex[:8]}@test.com",
            global_role=GlobalRole.player,
            status=UserStatus.active,
        )
        db.add(athlete)
        await db.flush()
        db.add(TeamMembership(user_id=athlete.id, team_id=team.id, team_role=TeamRole.athlete))
        athlete_ids.append(athlete.id)
    await db.commit()
    return team.id, athlete_ids


# ------------------------------------------------------------------ сводка


async def test_team_summary_aggregates_four_gauges(db):
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 3)

    # Три игрока с разным самочувствием и одинаковой сессией
    bands = [
        {"mood": 9, "energy": 9, "sleep_quality": 9, "stress": 2, "soreness": 2},  # green
        {"mood": 6, "energy": 6, "sleep_quality": 6, "stress": 5, "soreness": 5},  # yellow
        {"mood": 3, "energy": 3, "sleep_quality": 3, "stress": 8, "soreness": 8},  # red
    ]
    performances = [9, 6, 3]
    for athlete_id, band, performance in zip(athletes, bands, performances, strict=True):
        db.add(WellnessEntry(athlete_id=athlete_id, date=today, **band))
        db.add(
            RpeEntry(
                athlete_id=athlete_id,
                date=today,
                exertion=6,
                performance=performance,
                duration_min=90,
                session_load=540,
            )
        )
        db.add(
            AvailabilityRecord(
                athlete_id=athlete_id,
                date=today,
                status=AvailabilityStatus.full,
                set_by=athletes[0],
            )
        )
    await db.commit()
    for athlete_id in athletes:
        await analytics_service.recalc_athlete(db, athlete_id, end_date=today, commit=False)
    await db.commit()

    summary = await dashboard_service.team_summary(db, team_id, today)

    assert summary.squad_size == 3
    # По одному игроку в каждой зоне готовности
    assert summary.readiness.distribution == {"green": 1, "yellow": 1, "red": 1}
    assert summary.readiness.covered == 3

    # Перфоманс: среднее (9+6+3)/3 = 6.0 → жёлтая зона
    assert summary.performance.value == pytest.approx(6.0)
    assert summary.performance.zone == "yellow"

    assert summary.availability.value == pytest.approx(100.0)
    assert summary.availability.zone == "green"

    assert summary.wellness.filled == 3
    assert summary.wellness.missing == []
    assert summary.wellness.avg_energy == pytest.approx(6.0)


async def test_summary_missing_survey_is_no_data_not_zero(db):
    """Не заполнивший опрос не должен занижать средний Readiness команды."""
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 2)

    db.add(
        WellnessEntry(
            athlete_id=athletes[0], date=today, mood=9, energy=9, sleep_quality=9, stress=2, soreness=2
        )
    )
    await db.commit()
    await analytics_service.recalc_athlete(db, athletes[0], end_date=today)

    summary = await dashboard_service.team_summary(db, team_id, today)

    assert summary.readiness.covered == 1  # посчитан только заполнивший
    assert summary.readiness.total == 2
    assert summary.readiness.zone == "green"
    assert summary.wellness.filled == 1
    assert len(summary.wellness.missing) == 1


async def test_summary_splits_past_and_upcoming_events(db):
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 1)

    for offset, title in [(-2, "Вчерашняя"), (3, "Будущая")]:
        db.add(
            Event(
                team_id=team_id,
                type=EventType.training,
                title=title,
                planned_start=datetime.combine(today + timedelta(days=offset), time(18, 0), tzinfo=UTC),
                planned_duration_min=90,
                created_by=athletes[0],
            )
        )
    await db.commit()

    summary = await dashboard_service.team_summary(db, team_id, today)

    assert [e.title for e in summary.past_events] == ["Вчерашняя"]
    assert [e.title for e in summary.upcoming_events] == ["Будущая"]


async def test_alerts_flag_risk_players(db):
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 1)
    db.add(
        WellnessEntry(
            athlete_id=athletes[0], date=today, mood=2, energy=2, sleep_quality=2, stress=9, soreness=9
        )
    )
    db.add(
        InjuryRecord(
            athlete_id=athletes[0],
            type="Надрыв",
            body_region=BodyRegion.hamstring,
            body_side=BodySide.left,
            injury_type=InjuryType.muscle,
            severity=InjurySeverity.moderate,
            start_date=today - timedelta(days=3),
            status=InjuryStatus.active,
            created_by=athletes[0],
        )
    )
    await db.commit()
    await analytics_service.recalc_athlete(db, athletes[0], end_date=today)

    summary = await dashboard_service.team_summary(db, team_id, today)

    assert len(summary.alerts) == 1
    alert = summary.alerts[0]
    assert alert.severity == "risk"
    assert "low_readiness" in alert.reasons
    assert "injury" in alert.reasons


# ------------------------------------------------------------------ травмы


async def test_team_injuries_splits_active_and_healed_with_hotspots(db):
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 2)

    db.add(
        InjuryRecord(
            athlete_id=athletes[0],
            type="Повреждение связок голеностопа",
            body_region=BodyRegion.ankle,
            body_side=BodySide.right,
            injury_type=InjuryType.ligament,
            severity=InjurySeverity.moderate,
            start_date=today - timedelta(days=10),
            status=InjuryStatus.active,
            created_by=athletes[0],
        )
    )
    db.add(
        InjuryRecord(
            athlete_id=athletes[1],
            type="Подвывих голеностопа",
            body_region=BodyRegion.ankle,
            body_side=BodySide.left,
            injury_type=InjuryType.joint,
            severity=InjurySeverity.minor,
            start_date=today - timedelta(days=40),
            end_date=today - timedelta(days=30),
            status=InjuryStatus.closed,
            created_by=athletes[0],
        )
    )
    await db.commit()

    report = await dashboard_service.team_injuries(db, team_id, today)

    assert [i.kind for i in report.active] == ["injury"]
    assert report.active[0].body_region == BodyRegion.ankle
    assert report.active[0].days_out == 10
    assert len(report.recent) == 1
    # Обе травмы в голеностоп — самая горячая зона
    assert report.hotspots[0].body_region == BodyRegion.ankle
    assert report.hotspots[0].count == 2


async def test_team_injuries_includes_illness_from_survey(db):
    """«Клещ укусил» приходит не через InjuryRecord, а флагом symptom в опросе."""
    today = date.today()
    team_id, athletes = await _team_with_athletes(db, 1)

    db.add(
        WellnessEntry(
            athlete_id=athletes[0],
            date=today,
            mood=5,
            energy=4,
            sleep_quality=5,
            stress=5,
            soreness=4,
            symptom=True,
            symptom_type=SymptomType.other,
            symptom_details="Укус клеща, сдал анализы",
        )
    )
    await db.commit()

    report = await dashboard_service.team_injuries(db, team_id, today)

    assert len(report.active) == 1
    illness = report.active[0]
    assert illness.kind == "illness"
    assert illness.symptom_type == SymptomType.other
    assert illness.title == "Укус клеща, сдал анализы"
    assert illness.body_region is None  # у болезни нет зоны тела


# ------------------------------------------------------------------ доступ


async def test_dashboard_requires_team_staff(client, db):
    today = date.today()
    team_id, _ = await _team_with_athletes(db, 1)
    from tests.conftest import register_user

    outsider = await register_user(client, "outsider@example.com")
    for path in ("summary", "injuries", "squad-status"):
        resp = await client.get(
            f"/api/v1/dashboard/teams/{team_id}/{path}?day={today}", headers=outsider["headers"]
        )
        assert resp.status_code == 403, f"{path}: {resp.status_code}"
