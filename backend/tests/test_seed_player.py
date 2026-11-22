"""Сиды обходят enrollment API, но должны создавать исходную доступность."""

import uuid

from sqlalchemy import delete, select

from app.models.availability import AvailabilityBaseline
from app.models.organization import Organization
from app.models.team import Team
from app.services import availability_service
from scripts import seed_player
from tests.test_authz import build_org
from tests.test_availability import submit


async def seed_target(db, org):
    team = await db.get(Team, uuid.UUID(org["team_id"]))
    organization = await db.get(Organization, team.org_id)
    await seed_player.seed_player(
        "a1@org.com",
        organization.name,
        team.name,
        7,
        seed_player.demo.Archetype(load="steady", wellness="green", injured=False),
    )


async def test_seed_initializes_target_availability_without_backfilling_others(client, db):
    org = await build_org(client)
    target_id = uuid.UUID(org["athlete1"]["user_id"])
    other_id = uuid.UUID(org["athlete2"]["user_id"])
    other = await db.get(AvailabilityBaseline, other_id)
    unchanged = (other.start_date, other.version, other.org_id)
    await db.execute(delete(AvailabilityBaseline).where(AvailabilityBaseline.athlete_id == target_id))
    await db.commit()

    await seed_target(db, org)

    baseline = await db.scalar(
        select(AvailabilityBaseline).where(AvailabilityBaseline.athlete_id == target_id)
    )
    assert baseline.start_date == await availability_service.local_today(db, target_id)
    assert baseline.source == "enrollment"
    assert baseline.version == 0
    response = await client.get(
        f"/api/v1/availability/athletes/{target_id}/state", headers=org["coach"]["headers"]
    )
    assert response.status_code == 200
    assert response.json()["status"] == "full"
    assert response.json()["summary"]["tracked_days"] == 1
    await db.refresh(other)
    assert (other.start_date, other.version, other.org_id) == unchanged


async def test_seed_does_not_reset_existing_availability_restriction(client, db):
    org = await build_org(client)
    response = await submit(client, org, "medic", "medical", "unavailable")
    assert response.status_code == 201
    before = response.json()["state"]

    await seed_target(db, org)

    athlete_id = org["athlete1"]["user_id"]
    response = await client.get(
        f"/api/v1/availability/athletes/{athlete_id}/state", headers=org["coach"]["headers"]
    )
    assert response.status_code == 200
    after = response.json()
    assert after["status"] == "unavailable"
    assert after["version"] == before["version"]
    assert after["start_date"] == before["start_date"]
    assert after["medical"]["change"]["id"] == before["medical"]["change"]["id"]
