"""Цикл в истории wellness: опциональный контекст, не обход согласия. Реальная PostgreSQL."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, select

from app.config import settings
from app.models.consent import DataConsent
from app.models.cycle import CycleLog
from app.models.enums import ConsentAudience, ConsentScope, Sex, TeamRole
from app.models.team import Team, TeamMembership
from app.models.user import AthleteProfile, User
from app.models.wellness import WellnessEntry
from tests.test_authz import build_org

DAY = date(2026, 11, 10)


def endpoint(org):
    return f"/api/v1/analytics/athletes/{org['athlete1']['user_id']}/wellness-history"


async def read_history(client, org, who="coach", **params):
    return await client.get(
        endpoint(org),
        params={"team_id": org["team_id"], "date_from": "2026-11-08", "date_to": str(DAY)} | params,
        headers=org[who]["headers"],
    )


async def grant_cycle(db, org, audience=ConsentAudience.coach):
    consent = DataConsent(
        athlete_id=uuid.UUID(org["athlete1"]["user_id"]),
        scope=ConsentScope.cycle,
        audience=audience,
        policy_version=settings.consent_policy_version,
    )
    db.add(consent)
    await db.commit()
    return consent


@pytest.fixture
async def female_history(client, db, monkeypatch):
    monkeypatch.setattr(settings, "feature_cycle_enabled", True)
    org = await build_org(client)
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    profile = await db.get(AthleteProfile, athlete_id)
    if profile is None:
        db.add(AthleteProfile(user_id=athlete_id, sex=Sex.female))
    else:
        profile.sex = Sex.female
    await db.execute(
        delete(TeamMembership).where(TeamMembership.user_id == uuid.UUID(org["admin"]["user_id"]))
    )
    db.add(
        WellnessEntry(
            athlete_id=athlete_id, date=DAY, mood=6, energy=6, sleep_quality=6, stress=4, soreness=3
        )
    )
    for offset, marked in [(-6, True), (-5, True), (-2, True), (-1, False), (0, True), (1, True)]:
        db.add(
            CycleLog(athlete_id=athlete_id, date=DAY + timedelta(days=offset), on_period=marked, pain_level=9)
        )
    db.add(
        CycleLog(
            athlete_id=uuid.UUID(org["athlete2"]["user_id"]), date=DAY - timedelta(days=1), on_period=True
        )
    )
    await db.commit()
    return org


@pytest.mark.parametrize("who,visible", [("coach", True), ("medic", True), ("admin", False)])
async def test_cycle_dates_require_team_role_even_for_org_admin(client, db, female_history, who, visible):
    org = female_history
    await grant_cycle(db, org)
    response = await read_history(client, org, who)
    assert response.status_code == 200, response.text
    body = response.json()
    assert response.headers["cache-control"] == "private, no-store"
    assert body["days"][-1]["values"]["energy"] == 6
    if visible:
        assert body["cycle"] == {"period_days": ["2026-11-05", "2026-11-08", "2026-11-10"]}
        assert body["days"][-3]["values"] is None  # отметка существует и без утреннего опроса
        assert "pain_level" not in response.text
        assert "on_period" not in response.text
    else:
        assert body["cycle"] is None


@pytest.mark.parametrize("who,visible", [("coach", False), ("medic", True)])
async def test_medic_only_consent_does_not_open_coach_layer(client, db, female_history, who, visible):
    await grant_cycle(db, female_history, ConsentAudience.medic)
    response = await read_history(client, female_history, who)
    assert response.status_code == 200
    assert (response.json()["cycle"] is not None) is visible


@pytest.mark.parametrize("state", ["missing", "revoked", "stale", "none", "other_scope"])
async def test_unavailable_cycle_consent_does_not_block_regular_history(client, db, female_history, state):
    if state != "missing":
        consent = await grant_cycle(db, female_history)
        if state == "revoked":
            consent.revoked_at = datetime.now(UTC)
        elif state == "stale":
            consent.policy_version = "old-test-version"
        elif state == "none":
            consent.audience = ConsentAudience.none
        else:
            consent.scope = ConsentScope.nutrition
        await db.commit()
    response = await read_history(client, female_history)
    assert response.status_code == 200, response.text
    assert response.json()["cycle"] is None
    assert response.json()["days"][-1]["values"]["stress"] == 4


@pytest.mark.parametrize("sex", [Sex.male, Sex.not_specified, None])
async def test_non_female_or_missing_profile_hides_cycle_despite_old_logs(client, db, female_history, sex):
    await grant_cycle(db, female_history)
    athlete_id = uuid.UUID(female_history["athlete1"]["user_id"])
    profile = await db.get(AthleteProfile, athlete_id)
    if sex is None:
        await db.delete(profile)
    else:
        profile.sex = sex
    await db.commit()
    response = await read_history(client, female_history)
    assert response.status_code == 200
    assert response.json()["cycle"] is None


async def test_cycle_feature_off_hides_layer_not_wellness(client, db, female_history, monkeypatch):
    await grant_cycle(db, female_history)
    monkeypatch.setattr(settings, "feature_cycle_enabled", False)
    response = await read_history(client, female_history)
    assert response.status_code == 200
    assert response.json()["cycle"] is None
    assert response.json()["days"][-1]["values"] is not None


async def test_authorized_empty_cycle_is_not_missing_permission(client, db, female_history):
    await grant_cycle(db, female_history)
    await db.execute(
        delete(CycleLog).where(CycleLog.athlete_id == uuid.UUID(female_history["athlete1"]["user_id"]))
    )
    await db.commit()
    response = await read_history(client, female_history)
    assert response.status_code == 200
    assert response.json()["cycle"] == {"period_days": []}


async def test_cycle_access_uses_role_of_selected_team(client, db, female_history):
    org = female_history
    await grant_cycle(db, org, ConsentAudience.medic)
    coach = await db.get(User, uuid.UUID(org["coach"]["user_id"]))
    other = Team(org_id=coach.org_id, name="Other shared team")
    db.add(other)
    await db.flush()
    db.add_all(
        [
            TeamMembership(team_id=other.id, user_id=coach.id, team_role=TeamRole.medic),
            TeamMembership(
                team_id=other.id, user_id=uuid.UUID(org["athlete1"]["user_id"]), team_role=TeamRole.athlete
            ),
        ]
    )
    await db.commit()
    as_coach = await read_history(client, org)
    assert as_coach.status_code == 200
    assert as_coach.json()["cycle"] is None
    as_medic = await read_history(client, org, team_id=str(other.id))
    assert as_medic.status_code == 200
    assert as_medic.json()["cycle"]["period_days"]


async def test_revocation_hides_previously_available_layer_on_next_read(client, db, female_history):
    consent = await grant_cycle(db, female_history)
    before = await read_history(client, female_history)
    assert before.status_code == 200
    assert before.json()["cycle"]["period_days"]
    consent.revoked_at = datetime.now(UTC)
    await db.commit()
    after = await read_history(client, female_history)
    assert after.status_code == 200
    assert after.json()["cycle"] is None
    assert after.json()["days"] == before.json()["days"]
    assert (
        await db.scalar(
            select(CycleLog.on_period).where(
                CycleLog.athlete_id == uuid.UUID(female_history["athlete1"]["user_id"]), CycleLog.date == DAY
            )
        )
        is True
    )
