"""Числовая история состояния и командный ориентир: реальная PostgreSQL."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select

from app.models.enums import EventType, GlobalRole, TeamRole, UserStatus
from app.models.event import Event, EventWorkoutAthlete
from app.models.metric import DailyMetric
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.models.wellness import WellnessEntry
from tests.test_authz import build_org

DAY = date(2026, 11, 10)
KEYS = {"sleep_quality", "energy", "soreness", "stress", "mood"}


def entry(user_id, day=DAY, **overrides):
    return WellnessEntry(
        athlete_id=uuid.UUID(user_id),
        date=day,
        **({"mood": 6, "energy": 6, "sleep_quality": 6, "stress": 4, "soreness": 3} | overrides),
    )


def endpoint(org, **params):
    query = {"team_id": org["team_id"], "date_from": str(DAY - timedelta(days=2)), "date_to": str(DAY)}
    query.update(params)
    return f"/api/v1/analytics/athletes/{org['athlete1']['user_id']}/wellness-history", query


@pytest.fixture
async def history_org(client, db):
    org = await build_org(client)
    db.add_all(
        [
            entry(
                org["athlete1"]["user_id"],
                stress=8,
                soreness=9,
                sleep_quality=3,
                resting_hr=75,
                weight_kg=70,
                injury=True,
                injury_details="NEVER_EXPOSE_DIAGNOSIS",
                symptom_details="NEVER_EXPOSE_SYMPTOM",
                comment="NEVER_EXPOSE_COMMENT",
                created_at=datetime(2026, 11, 10, 5, 15, tzinfo=UTC),
            ),
            entry(org["athlete2"]["user_id"]),
            entry(org["athlete1"]["user_id"], DAY - timedelta(days=2), stress=5),
        ]
    )
    await db.commit()
    return org


async def test_calendar_has_gaps_context_and_safe_values(client, db, history_org):
    org = history_org
    url, params = endpoint(org)
    response = await client.get(url, params=params, headers=org["coach"]["headers"])
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["date_from"] == "2026-11-08"
    assert body["context_from"] == "2026-11-05"
    assert len(body["days"]) == 6
    days = {row["date"]: row for row in body["days"]}
    assert days["2026-11-09"]["values"] is None
    assert days["2026-11-09"]["submitted_at"] is None
    assert days["2026-11-09"]["team_average"] is None
    day = days["2026-11-10"]
    assert set(day["values"]) == KEYS
    assert day["values"]["stress"] == 8
    assert day["values"]["soreness"] == 9
    assert day["values"]["sleep_quality"] == 3
    assert day["team_average"]["count"] == 1
    assert day["team_average"]["values"]["stress"] == 4
    assert day["submitted_at"].startswith("2026-11-10T05:15:00")
    assert "NEVER_EXPOSE" not in response.text
    assert not {"resting_hr", "weight_kg", "injury", "comment", "pain_points"} & set(day)
    assert await db.scalar(select(func.count()).select_from(DailyMetric)) == 0


@pytest.mark.parametrize("who", ["coach", "medic", "admin"])
async def test_staff_and_org_admin_can_read(client, db, history_org, who):
    org = history_org
    if who == "admin":
        await db.execute(
            delete(TeamMembership).where(TeamMembership.user_id == uuid.UUID(org[who]["user_id"]))
        )
        await db.commit()
    url, params = endpoint(org)
    response = await client.get(url, params=params, headers=org[who]["headers"])
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("who,status", [("athlete1", 403), ("athlete2", 403), ("outsider", 404)])
async def test_players_cannot_obtain_team_aggregates(client, history_org, who, status):
    url, params = endpoint(history_org)
    response = await client.get(url, params=params, headers=history_org[who]["headers"])
    assert response.status_code == status, response.text


async def test_no_token_is_unauthorized(client, history_org):
    url, params = endpoint(history_org)
    assert (await client.get(url, params=params)).status_code == 401


async def test_wrong_team_and_non_athlete_target_are_not_found(client, db, history_org):
    org = history_org
    coach = await db.get(User, uuid.UUID(org["coach"]["user_id"]))
    other = Team(name="Other team", org_id=coach.org_id)
    db.add(other)
    await db.flush()
    db.add(TeamMembership(team_id=other.id, user_id=coach.id, team_role=TeamRole.coach))
    await db.commit()
    url, params = endpoint(org, team_id=str(other.id))
    assert (await client.get(url, params=params, headers=org["coach"]["headers"])).status_code == 404
    url, params = endpoint(org)
    url = url.replace(org["athlete1"]["user_id"], org["medic"]["user_id"])
    assert (await client.get(url, params=params, headers=org["coach"]["headers"])).status_code == 404


async def test_foreign_org_is_denied_even_with_manual_membership(client, db, history_org):
    org = history_org
    outsider_id = uuid.UUID(org["outsider"]["user_id"])
    db.add(TeamMembership(team_id=uuid.UUID(org["team_id"]), user_id=outsider_id, team_role=TeamRole.medic))
    await db.commit()
    url, params = endpoint(org)
    assert (await client.get(url, params=params, headers=org["outsider"]["headers"])).status_code == 404


async def test_average_excludes_selected_staff_inactive_and_foreign_members(client, db, history_org):
    org = history_org
    actor = await db.get(User, uuid.UUID(org["coach"]["user_id"]))
    team_id = uuid.UUID(org["team_id"])
    for name, status, org_id in [
        ("third", UserStatus.active, actor.org_id),
        ("blocked", UserStatus.blocked, actor.org_id),
        ("foreign", UserStatus.active, None),
    ]:
        user = User(
            email=f"{name}@wellness-history.test", global_role=GlobalRole.player, status=status, org_id=org_id
        )
        db.add(user)
        await db.flush()
        db.add(TeamMembership(team_id=team_id, user_id=user.id, team_role=TeamRole.athlete))
        db.add(entry(str(user.id), stress=7 if name == "third" else 10))
    db.add(entry(org["coach"]["user_id"], stress=10))
    await db.commit()
    url, params = endpoint(org)
    body = (await client.get(url, params=params, headers=org["coach"]["headers"])).json()
    average = body["days"][-1]["team_average"]
    assert average["count"] == 2
    assert average["values"]["stress"] == 5.5


async def test_events_use_org_dates_assignments_and_three_day_context(client, db, history_org):
    org = history_org
    actor = await db.get(User, uuid.UUID(org["coach"]["user_id"]))
    organization = await db.get(Organization, actor.org_id)
    organization.timezone = "Asia/Yekaterinburg"
    team_id = uuid.UUID(org["team_id"])
    game = Event(
        team_id=team_id,
        type=EventType.match,
        title="Test game",
        planned_start=datetime(2026, 11, 9, 21, 30, tzinfo=UTC),
        planned_duration_min=90,
        created_by=actor.id,
    )
    context_game = Event(
        team_id=team_id,
        type=EventType.match,
        title="Context game",
        planned_start=datetime(2026, 11, 7, 12, tzinfo=UTC),
        planned_duration_min=90,
        created_by=actor.id,
    )
    targeted = Event(
        team_id=team_id,
        type=EventType.training,
        title="Other athlete only",
        planned_start=datetime(2026, 11, 10, 10, tzinfo=UTC),
        planned_duration_min=60,
        created_by=actor.id,
    )
    personal = Event(
        type=EventType.match,
        title="Personal event",
        planned_start=datetime(2026, 11, 10, 12, tzinfo=UTC),
        planned_duration_min=60,
        created_by=uuid.UUID(org["athlete1"]["user_id"]),
    )
    db.add_all([game, context_game, targeted, personal])
    await db.flush()
    db.add(EventWorkoutAthlete(event_id=targeted.id, athlete_id=uuid.UUID(org["athlete2"]["user_id"])))
    await db.commit()
    url, params = endpoint(org, date_from=str(DAY))
    body = (await client.get(url, params=params, headers=org["medic"]["headers"])).json()
    assert body["timezone"] == "Asia/Yekaterinburg"
    assert [e["id"] for e in body["games"]] == [str(game.id)]
    assert body["games"][0]["date"] == "2026-11-10"
    assert body["days"][0]["date"] == "2026-11-07"
    assert body["days"][0]["events"][0]["id"] == str(context_game.id)
    assert [e["id"] for e in body["days"][-1]["events"]] == [str(game.id)]
    assert set(body["games"][0]) == {"id", "date", "type", "title", "planned_start"}


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-11-11", "date_to": "2026-11-10"},
        {"date_from": str(DAY - timedelta(days=90)), "date_to": str(DAY)},
        {"date_to": "2100-01-01"},
        {"date_from": "0001-01-01", "date_to": "0001-01-01"},
        {"date_from": "not-a-date"},
        {"team_id": "not-a-uuid"},
    ],
)
async def test_invalid_periods_are_rejected(client, history_org, params):
    url, query = endpoint(history_org, **params)
    response = await client.get(url, params=query, headers=history_org["coach"]["headers"])
    assert response.status_code == 422, response.text


async def test_default_and_ninety_day_windows_and_empty_days(client, history_org):
    org = history_org
    url, _ = endpoint(org)
    response = await client.get(url, params={"team_id": org["team_id"]}, headers=org["coach"]["headers"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["days"]) == 10
    assert (date.fromisoformat(body["date_to"]) - date.fromisoformat(body["date_from"])).days == 6
    assert body["date_to"] == body["today"]
    url, params = endpoint(org, date_from=str(DAY - timedelta(days=89)))
    response = await client.get(url, params=params, headers=org["coach"]["headers"])
    assert response.status_code == 200, response.text
    assert len(response.json()["days"]) == 93


async def test_missing_athlete_and_no_teammate_answers(client, db, history_org):
    org = history_org
    await db.execute(
        delete(WellnessEntry).where(WellnessEntry.athlete_id == uuid.UUID(org["athlete2"]["user_id"]))
    )
    await db.commit()
    url, params = endpoint(org)
    body = (await client.get(url, params=params, headers=org["coach"]["headers"])).json()
    assert body["days"][-1]["values"]["stress"] == 8
    assert body["days"][-1]["team_average"] is None
    url = url.replace(org["athlete1"]["user_id"], str(uuid.uuid4()))
    assert (await client.get(url, params=params, headers=org["coach"]["headers"])).status_code == 404
