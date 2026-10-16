"""Цикл — минимальный трекинг (решение 2026-10-16): отметка дня + болевой порог.

Главное здесь — что без явного согласия (ensure_can_view_sensitive) данные не
видны штабу вообще, а сама спортсменка видит свои данные всегда.
"""

import uuid
from datetime import date

import pytest
from fastapi import HTTPException

from app.core import authz
from app.models.enums import (
    ConsentAudience,
    ConsentScope,
    GlobalRole,
    TeamRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.schemas.cycle import CycleLogIn, CycleSettingsIn
from app.services import consent_service, cycle_service
from tests.conftest import register_user


async def _team_with_female_athlete(db) -> dict:
    org = Organization(name="Клуб")
    db.add(org)
    await db.flush()
    team = Team(org_id=org.id, name="Основа")
    db.add(team)
    await db.flush()

    def make(name: str, role: GlobalRole) -> User:
        user = User(
            org_id=org.id,
            last_name=name,
            email=f"{name}-{uuid.uuid4().hex[:8]}@test.com",
            global_role=role,
            status=UserStatus.active,
        )
        db.add(user)
        return user

    athlete = make("athlete", GlobalRole.player)
    coach = make("coach", GlobalRole.staff)
    medic = make("medic", GlobalRole.staff)
    await db.flush()
    for user, role in [
        (athlete, TeamRole.athlete),
        (coach, TeamRole.coach),
        (medic, TeamRole.medic),
    ]:
        db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=role))
    await db.commit()
    return {"athlete": athlete, "coach": coach, "medic": medic}


# ------------------------------------------------------------------ записи


async def test_upsert_log_replaces_not_duplicates(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=today, on_period=True, pain_level=5))
    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=today, on_period=True, pain_level=7))

    logs = await cycle_service.get_logs(db, athlete_id, today, today)
    assert len(logs) == 1
    assert logs[0].pain_level == 7


async def test_upsert_log_on_arbitrary_past_date(db):
    """Календарь правит произвольный прошлый день, не только сегодня."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    past = date(2026, 7, 1)

    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=past, on_period=True, pain_level=3))

    logs = await cycle_service.get_logs(db, athlete_id, past, past)
    assert len(logs) == 1
    assert logs[0].on_period is True
    assert logs[0].pain_level == 3


async def test_delete_log(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=today, on_period=True))

    await cycle_service.delete_log(db, athlete_id, today)

    assert await cycle_service.get_logs(db, athlete_id, today, today) == []


# ------------------------------------------------------------------ настройки


async def test_settings_default_is_tracking_disabled(db):
    world = await _team_with_female_athlete(db)
    settings = await cycle_service.get_settings(db, world["athlete"].id)
    assert settings.tracking_enabled is False
    assert settings.average_cycle_length == 28
    assert settings.average_period_length == 5


async def test_settings_upsert_partial(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id

    await cycle_service.upsert_settings(db, athlete_id, CycleSettingsIn(tracking_enabled=True))
    await cycle_service.upsert_settings(db, athlete_id, CycleSettingsIn(average_cycle_length=30))

    settings = await cycle_service.get_settings(db, athlete_id)
    assert settings.tracking_enabled is True
    assert settings.average_cycle_length == 30
    assert settings.average_period_length == 5  # не тронуто частичным обновлением


# ------------------------------------------------------------------ доступ


async def test_cycle_data_closed_without_consent(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    for role in ("coach", "medic"):
        with pytest.raises(HTTPException):
            await authz.ensure_can_view_sensitive(db, world[role], athlete_id, ConsentScope.cycle)


async def test_medic_consent_opens_cycle_to_medic_only(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.medic)

    await authz.ensure_can_view_sensitive(db, world["medic"], athlete_id, ConsentScope.cycle)
    with pytest.raises(HTTPException):
        await authz.ensure_can_view_sensitive(db, world["coach"], athlete_id, ConsentScope.cycle)


async def test_coach_consent_opens_cycle_to_both(db):
    """coach — старшая роль (consent_service._AUDIENCE_RANK): видит всё, что видит medic."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)

    await authz.ensure_can_view_sensitive(db, world["coach"], athlete_id, ConsentScope.cycle)
    await authz.ensure_can_view_sensitive(db, world["medic"], athlete_id, ConsentScope.cycle)


async def test_staff_view_shape(db):
    """Единая витрина: только on_period и pain_level, детализации не осталось."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=today, on_period=True, pain_level=8))

    view = await cycle_service.staff_view(db, athlete_id, today)
    assert set(view.model_dump()) == {"athlete_id", "date", "on_period", "pain_level"}
    assert view.on_period is True
    assert view.pain_level == 8


async def test_staff_view_no_log_is_not_on_period(db):
    world = await _team_with_female_athlete(db)
    view = await cycle_service.staff_view(db, world["athlete"].id, date(2026, 8, 8))
    assert view.on_period is False
    assert view.pain_level is None


# ------------------------------------------------------------------ API


async def test_cycle_api_is_self_only(client):
    """Эндпоинта «записать цикл за игрока» не существует и не должно появиться."""
    user = await register_user(client, "cycle@example.com")
    other = uuid.uuid4()
    for path in (f"/api/v1/cycle/athletes/{other}/logs", f"/api/v1/cycle/athletes/{other}/settings"):
        resp = await client.put(path, json={"date": "2026-08-08"}, headers=user["headers"])
        assert resp.status_code in (404, 405), f"{path}: {resp.status_code}"


async def test_cycle_api_roundtrip(client):
    user = await register_user(client, "cycle2@example.com")
    today = date.today().isoformat()

    resp = await client.put(
        "/api/v1/cycle/me/settings", json={"tracking_enabled": True}, headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["tracking_enabled"] is True

    resp = await client.put(
        "/api/v1/cycle/me/logs",
        json={"date": today, "on_period": True, "pain_level": 7},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["on_period"] is True
    assert resp.json()["pain_level"] == 7

    resp = await client.get("/api/v1/cycle/me/logs", headers=user["headers"])
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = await client.delete(f"/api/v1/cycle/me/logs/{today}", headers=user["headers"])
    assert resp.status_code == 204


async def test_athlete_state_endpoint_requires_consent(client, db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    await cycle_service.upsert_log(
        db, athlete_id, CycleLogIn(date=date.today(), on_period=True, pain_level=6)
    )

    coach = await register_user(client, world["coach"].email, "coach-device-01")
    resp = await client.get(f"/api/v1/cycle/athletes/{athlete_id}/state", headers=coach["headers"])
    assert resp.status_code == 403

    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)
    resp = await client.get(f"/api/v1/cycle/athletes/{athlete_id}/state", headers=coach["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "athlete_id": str(athlete_id),
        "date": date.today().isoformat(),
        "on_period": True,
        "pain_level": 6,
    }
