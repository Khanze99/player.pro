import uuid
from datetime import date, timedelta
from itertools import product

import pytest

from app.core.availability import effective_status


@pytest.mark.parametrize("medical,coaching", product(["full", "modified", "unavailable"], repeat=2))
def test_stricter_direction_wins(medical, coaching):
    order = ["full", "modified", "unavailable"]
    assert effective_status(medical, coaching) == order[max(order.index(medical), order.index(coaching))]


async def test_new_athlete_starts_full_without_backfilling_history(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    athlete_id = org["athlete1"]["user_id"]
    response = await client.get(
        f"/api/v1/availability/athletes/{athlete_id}/state", headers=org["coach"]["headers"]
    )
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["status"] == "full"
    assert state["start_date"] == str(date.today())
    assert state["summary"]["tracked_days"] == 1
    assert state["summary"]["availability_percent"] == 100
    assert state["editable_directions"] == ["coaching"]


async def submit(client, org, who, direction, status, **extra):
    athlete_id = org["athlete1"]["user_id"]
    state = (
        await client.get(f"/api/v1/availability/athletes/{athlete_id}/state", headers=org[who]["headers"])
    ).json()
    payload = dict(
        athlete_id=athlete_id,
        direction=direction,
        status=status,
        date=state["today"],
        comment="Synthetic restriction",
        request_id=str(uuid.uuid4()),
        expected_version=state["version"],
    )
    payload.update(extra)
    return await client.post("/api/v1/availability/changes", json=payload, headers=org[who]["headers"])


@pytest.mark.parametrize("first", ["medic", "coach"])
async def test_neither_profession_can_remove_the_other_restriction(client, first):
    from tests.test_authz import build_org

    org = await build_org(client)
    assert (await submit(client, org, "medic", "medical", "modified")).status_code == 201
    assert (await submit(client, org, "coach", "coaching", "unavailable")).status_code == 201
    directions = {"medic": "medical", "coach": "coaching"}
    second = "coach" if first == "medic" else "medic"
    response = await submit(client, org, first, directions[first], "full")
    assert response.status_code == 201, response.text
    assert response.json()["state"]["status"] == ("unavailable" if first == "medic" else "modified")
    response = await submit(client, org, second, directions[second], "full")
    assert response.json()["state"]["status"] == "full"
    for who, direction in [("coach", "medical"), ("medic", "coaching")]:
        assert (await submit(client, org, who, direction, "full")).status_code == 403


async def test_diagnosis_readable_by_coach_but_not_admin_without_team_role(client, db):
    from sqlalchemy import delete

    from app.models.team import TeamMembership
    from tests.test_authz import build_org

    org = await build_org(client)
    response = await submit(client, org, "medic", "medical", "modified", medical_note="Synthetic diagnosis")
    assert response.status_code == 201, response.text
    athlete = org["athlete1"]["user_id"]
    assert "Synthetic diagnosis" not in response.text
    url = f"/api/v1/availability/athletes/{athlete}/medical-notes"
    for who in ("coach", "medic", "athlete1"):
        response = await client.get(url, headers=org[who]["headers"])
        assert response.status_code == 200
        assert response.json()["items"][0]["medical_note"] == "Synthetic diagnosis"
    await db.execute(
        delete(TeamMembership).where(TeamMembership.user_id == uuid.UUID(org["admin"]["user_id"]))
    )
    await db.commit()
    for who in ("admin", "athlete2", "outsider"):
        assert (await client.get(url, headers=org[who]["headers"])).status_code in (403, 404)
    response = await submit(client, org, "coach", "coaching", "modified", medical_note="Not permitted")
    assert response.status_code == 403
    response = await client.get(
        f"/api/v1/availability/athletes/{athlete}/state", headers=org["admin"]["headers"]
    )
    assert response.json()["editable_directions"] == []
    assert response.json()["medical"]["change"] is None


async def test_comment_validation_dates_conflict_and_replay(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    for comment in ("", "   ", "x" * 1001):
        response = await submit(client, org, "coach", "coaching", "modified", comment=comment)
        assert response.status_code == 422
        assert '"input"' not in response.text
    for day in (date.today() + timedelta(days=1), date.today() - timedelta(days=1)):
        assert (await submit(client, org, "coach", "coaching", "modified", date=str(day))).status_code == 422
    request_id = str(uuid.uuid4())
    response = await submit(client, org, "coach", "coaching", "modified", request_id=request_id)
    assert response.status_code == 201, response.text
    original_id = response.json()["change"]["id"]
    response = await submit(
        client, org, "coach", "coaching", "modified", request_id=request_id, expected_version=0
    )
    assert response.status_code == 201
    assert response.json()["change"]["id"] == original_id
    assert (await submit(client, org, "coach", "coaching", "full", expected_version=0)).status_code == 409
    assert (await submit(client, org, "coach", "coaching", "full", request_id=request_id)).status_code == 409
    athlete = org["athlete1"]["user_id"]
    history = await client.get(
        f"/api/v1/availability/athletes/{athlete}/changes", headers=org["coach"]["headers"]
    )
    assert history.json()["total"] == 1
    response = await client.put(
        "/api/v1/availability",
        headers=org["coach"]["headers"],
        json=dict(athlete_id=athlete, date=str(date.today()), status="full"),
    )
    assert response.status_code == 410


async def test_health_consent_revocation_blocks_detail_and_writes(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    await client.put(
        "/api/v1/consents/policy",
        json={"kind": "health_data", "granted": False},
        headers=org["athlete1"]["headers"],
    )
    assert (await submit(client, org, "coach", "coaching", "modified")).status_code == 403
    athlete = org["athlete1"]["user_id"]
    response = await client.get(
        f"/api/v1/availability/athletes/{athlete}/medical-notes", headers=org["coach"]["headers"]
    )
    assert response.status_code == 403


async def test_summary_uses_both_inherited_directions(client, db):
    from app.models.availability import AvailabilityBaseline
    from tests.test_authz import build_org

    org = await build_org(client)
    athlete = uuid.UUID(org["athlete1"]["user_id"])
    baseline = await db.get(AvailabilityBaseline, athlete)
    baseline.start_date = date.today() - timedelta(days=89)
    await db.commit()
    response = await submit(
        client, org, "medic", "medical", "modified", date=str(date.today() - timedelta(days=44))
    )
    assert response.status_code == 201
    assert response.json()["state"]["summary"]["availability_percent"] == 50
    response = await submit(client, org, "coach", "coaching", "full")
    assert response.json()["state"]["summary"]["availability_percent"] == 50
    response = await submit(client, org, "medic", "medical", "full")
    assert response.json()["state"]["summary"]["full_days"] == 46
    history = await client.get(
        f"/api/v1/availability/athletes/{athlete}/changes?page=1&size=2", headers=org["coach"]["headers"]
    )
    assert history.json()["total"] == 3
    assert len(history.json()["items"]) == 2


async def test_old_clients_accept_their_actual_health_version_without_forced_update(client):
    from tests.test_policy_consent import _register_without_consent

    user = await _register_without_consent(client, "old-consent@example.com", "old-consent-device")
    for payload in (
        {"kind": "health_data", "granted": True},
        {"kind": "health_data", "granted": True, "policy_version": "2026-11-08"},
    ):
        response = await client.put("/api/v1/consents/policy", json=payload, headers=user["headers"])
        assert response.status_code == 200, response.text
        assert response.json()["health_data"]["policy_version"] == "2026-11-08"
    status = await client.get("/api/v1/consents/policy", headers=user["headers"])
    assert status.json()["health_data"]["granted"] is True


@pytest.mark.parametrize("version", ["2026-09-03", "2026-11-08", "2026-11-19"])
async def test_signed_legacy_consents_remain_unchanged_and_allow_availability(client, db, version):
    from sqlalchemy import select

    from app.models.enums import PolicyConsentKind
    from app.models.policy_consent import PolicyConsent
    from tests.test_authz import build_org

    org = await build_org(client)
    ids = [uuid.UUID(org[key]["user_id"]) for key in ("coach", "medic", "athlete1")]
    consents = list(await db.scalars(select(PolicyConsent).where(PolicyConsent.user_id.in_(ids))))
    for consent in consents:
        if consent.kind == PolicyConsentKind.health_data:
            consent.policy_version = version
    await db.commit()
    before = [(c.id, c.policy_version, c.granted_at, c.revoked_at) for c in consents]
    for key in ("coach", "medic", "athlete1"):
        me = await client.get("/api/v1/auth/me", headers=org[key]["headers"])
        assert me.json()["health_consent_accepted"] is True
    response = await submit(client, org, "medic", "medical", "modified", medical_note="Synthetic diagnosis")
    assert response.status_code == 201, response.text
    response = await client.get(
        f"/api/v1/availability/athletes/{org['athlete1']['user_id']}/medical-notes",
        headers=org["coach"]["headers"],
    )
    assert response.status_code == 200
    db.expire_all()
    after = list(await db.scalars(select(PolicyConsent).where(PolicyConsent.user_id.in_(ids))))
    assert sorted(before) == sorted((c.id, c.policy_version, c.granted_at, c.revoked_at) for c in after)


async def test_concurrent_decisions_do_not_overwrite_each_other(client):
    import asyncio

    from tests.test_authz import build_org

    org = await build_org(client)
    responses = await asyncio.gather(
        submit(client, org, "medic", "medical", "modified", expected_version=0),
        submit(client, org, "coach", "coaching", "unavailable", expected_version=0),
    )
    assert sorted(r.status_code for r in responses) == [201, 409]
    who, direction, status = (
        ("medic", "medical", "modified")
        if responses[0].status_code == 409
        else ("coach", "coaching", "unavailable")
    )
    response = await submit(client, org, who, direction, status)
    assert response.status_code == 201
    assert response.json()["state"]["medical"]["status"] == "modified"
    assert response.json()["state"]["coaching"]["status"] == "unavailable"


async def test_same_request_id_racing_across_athletes_returns_conflict(client):
    import asyncio

    from tests.test_authz import build_org

    org = await build_org(client)
    request_id = str(uuid.uuid4())
    responses = await asyncio.gather(
        *[
            submit(
                client,
                org,
                "coach",
                "coaching",
                "modified",
                athlete_id=org[key]["user_id"],
                request_id=request_id,
                expected_version=0,
            )
            for key in ("athlete1", "athlete2")
        ]
    )
    assert sorted(r.status_code for r in responses) == [201, 409]


async def test_current_diagnosis_survives_90_day_history_window(client, db):
    from app.models.availability import AvailabilityBaseline
    from tests.test_authz import build_org

    org = await build_org(client)
    athlete = uuid.UUID(org["athlete1"]["user_id"])
    baseline = await db.get(AvailabilityBaseline, athlete)
    baseline.start_date = date.today() - timedelta(days=120)
    await db.commit()
    response = await submit(
        client,
        org,
        "medic",
        "medical",
        "modified",
        date=str(date.today() - timedelta(days=100)),
        medical_note="Persistent diagnosis",
    )
    assert response.status_code == 201
    response = await client.get(
        f"/api/v1/availability/athletes/{athlete}/medical-notes", headers=org["coach"]["headers"]
    )
    assert response.json()["items"] == []
    assert response.json()["current"]["medical_note"] == "Persistent diagnosis"


async def test_lost_membership_and_other_tenant_cannot_read_notes(client, db):
    from sqlalchemy import delete

    from app.models.team import TeamMembership
    from tests.test_authz import build_org

    org = await build_org(client)
    other = await build_org(client, suffix="-other")
    await submit(client, org, "medic", "medical", "modified", medical_note="Private example")
    url = f"/api/v1/availability/athletes/{org['athlete1']['user_id']}/medical-notes"
    assert (await client.get(url, headers=other["coach"]["headers"])).status_code == 404
    await db.execute(
        delete(TeamMembership).where(TeamMembership.user_id == uuid.UUID(org["coach"]["user_id"]))
    )
    await db.commit()
    assert (await client.get(url, headers=org["coach"]["headers"])).status_code == 403


async def test_dashboard_and_card_use_org_calendar_day(client, db):
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    from app.models.organization import Organization
    from app.models.team import Team
    from tests.test_authz import build_org

    org = await build_org(client)
    team = await db.get(Team, uuid.UUID(org["team_id"]))
    organization = await db.get(Organization, team.org_id)
    organization.timezone = "Pacific/Kiritimati"
    await db.commit()
    expected_day = str(datetime.now(UTC).astimezone(ZoneInfo(organization.timezone)).date())
    athlete = org["athlete1"]["user_id"]
    card = await client.get(f"/api/v1/availability/athletes/{athlete}/state", headers=org["coach"]["headers"])
    squad = await client.get(
        f"/api/v1/dashboard/teams/{org['team_id']}/squad-status", headers=org["coach"]["headers"]
    )
    assert card.json()["today"] == squad.json()["date"] == expected_day


async def test_dual_role_is_explicit_and_membership_initialization_does_not_reset_status(client, db):
    from app.models.availability import AvailabilityBaseline
    from app.models.enums import TeamRole
    from app.models.team import Team, TeamMembership
    from app.models.user import User
    from app.services.availability_service import initialize_athlete
    from tests.test_authz import build_org

    org = await build_org(client)
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    medic_id = uuid.UUID(org["medic"]["user_id"])
    athlete = await db.get(User, athlete_id)
    second_team = Team(org_id=athlete.org_id, name="Another team")
    db.add(second_team)
    await db.flush()
    db.add_all(
        [
            TeamMembership(user_id=athlete_id, team_id=second_team.id, team_role=TeamRole.athlete),
            TeamMembership(user_id=medic_id, team_id=second_team.id, team_role=TeamRole.coach),
        ]
    )
    await db.commit()
    response = await submit(client, org, "medic", "medical", "modified")
    assert response.json()["state"]["editable_directions"] == ["medical", "coaching"]
    await initialize_athlete(db, athlete)
    await db.commit()
    db.expire_all()
    assert (await db.get(AvailabilityBaseline, athlete_id)).version == 1
    response = await submit(client, org, "medic", "coaching", "full")
    assert response.json()["state"]["status"] == "modified"


async def test_staff_role_does_not_make_another_staff_member_an_athlete(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    response = await submit(client, org, "coach", "coaching", "modified", athlete_id=org["medic"]["user_id"])
    assert response.status_code == 403
