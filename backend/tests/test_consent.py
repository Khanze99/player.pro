"""Согласия на спецкатегории персданных и доступ к ним (152-ФЗ, ст. 10).

Здесь проверяется не «работает ли фича», а что закрытое остаётся закрытым:
каждое отличие от обычной authz — сознательное и должно держаться регрессией.
"""

import uuid

import pytest

from app.config import settings
from app.core import authz
from app.models.enums import ConsentAudience, ConsentScope, GlobalRole, Sex, TeamRole, UserStatus
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.services import consent_service
from tests.conftest import register_user


async def _org_with_staff(db) -> dict:
    """Организация, команда, игрок и полный набор ролей вокруг него."""
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
    admin = make("admin", GlobalRole.admin)
    await db.flush()

    for user, role in [
        (athlete, TeamRole.athlete),
        (coach, TeamRole.head_coach),
        (medic, TeamRole.medic),
    ]:
        db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=role))
    await db.commit()
    return {"org": org, "team": team, "athlete": athlete, "coach": coach, "medic": medic, "admin": admin}


async def _denied(db, viewer, athlete_id, scope=ConsentScope.cycle) -> bool:
    try:
        await authz.ensure_can_view_sensitive(db, viewer, athlete_id, scope)
        return False
    except Exception:
        return True


# ------------------------------------------------------- дефолт: всё закрыто


async def test_no_consent_means_nobody_sees(db):
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id

    for role in ("coach", "medic", "admin"):
        assert await _denied(db, world[role], athlete_id), f"{role} не должен видеть без согласия"


async def test_athlete_always_sees_own_data(db):
    world = await _org_with_staff(db)
    await authz.ensure_can_view_sensitive(db, world["athlete"], world["athlete"].id, ConsentScope.cycle)


# ------------------------------------------------------- уровни доступа


async def test_medic_consent_does_not_open_data_to_coach(db):
    """Открыть врачу — не значит открыть тренеру. Центральное правило раздела."""
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.medic)

    await authz.ensure_can_view_sensitive(db, world["medic"], athlete_id, ConsentScope.cycle)
    assert await _denied(db, world["coach"], athlete_id)


async def test_coach_consent_also_covers_medic(db):
    """Уровни вложены: разрешив тренеру, игрок разрешает и врачу."""
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)

    await authz.ensure_can_view_sensitive(db, world["coach"], athlete_id, ConsentScope.cycle)
    await authz.ensure_can_view_sensitive(db, world["medic"], athlete_id, ConsentScope.cycle)


async def test_org_admin_never_sees_sensitive_data(db):
    """Расхождение с ensure_can_view_athlete: админ это менеджер клуба, не медработник."""
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)

    # Обычные данные админу доступны…
    await authz.ensure_can_view_athlete(db, world["admin"], athlete_id)
    # …а спецкатегории — нет, даже при максимальном согласии
    assert await _denied(db, world["admin"], athlete_id)


async def test_scopes_are_independent(db):
    """Согласие на питание не открывает цикл."""
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.nutrition, ConsentAudience.coach)

    await authz.ensure_can_view_sensitive(db, world["coach"], athlete_id, ConsentScope.nutrition)
    assert await _denied(db, world["coach"], athlete_id, ConsentScope.cycle)


async def test_outsider_staff_without_shared_team_denied(db):
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)

    outsider = User(
        org_id=world["org"].id,
        last_name="Чужой",
        first_name="Тренер",
        email=f"out-{uuid.uuid4().hex[:8]}@test.com",
        global_role=GlobalRole.staff,
        status=UserStatus.active,
    )
    db.add(outsider)
    await db.commit()

    assert await _denied(db, outsider, athlete_id)


# ------------------------------------------------------- отзыв и история


async def test_revoke_closes_access_but_keeps_history(db):
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)
    await consent_service.revoke(db, athlete_id, ConsentScope.cycle)

    assert await _denied(db, world["coach"], athlete_id)
    assert await consent_service.get_active(db, athlete_id, ConsentScope.cycle) is None

    # Строка не удалена — история согласий обязана сохраняться
    from sqlalchemy import func, select

    from app.models.consent import DataConsent

    total = await db.execute(
        select(func.count()).select_from(DataConsent).where(DataConsent.athlete_id == athlete_id)
    )
    assert total.scalar() == 1


async def test_regrant_leaves_single_active_consent(db):
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.medic)
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)

    active = await consent_service.get_active(db, athlete_id, ConsentScope.cycle)
    assert active is not None
    assert active.audience == ConsentAudience.coach

    from sqlalchemy import func, select

    from app.models.consent import DataConsent

    rows = await db.execute(
        select(func.count())
        .select_from(DataConsent)
        .where(DataConsent.athlete_id == athlete_id, DataConsent.revoked_at.is_(None))
    )
    assert rows.scalar() == 1


async def test_policy_version_bump_invalidates_consent(db, monkeypatch):
    """Изменился текст согласия — старое согласие перестаёт действовать."""
    world = await _org_with_staff(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)
    assert not await _denied(db, world["coach"], athlete_id)

    monkeypatch.setattr(settings, "consent_policy_version", "2027-01-01")
    assert await _denied(db, world["coach"], athlete_id)
    assert await consent_service.audience_for(db, athlete_id, ConsentScope.cycle) == ConsentAudience.none


# ------------------------------------------------------- API


async def test_consent_api_roundtrip(client):
    user = await register_user(client, "consent@example.com")

    resp = await client.get("/api/v1/consents/me", headers=user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert {c["scope"] for c in body["consents"]} == {s.value for s in ConsentScope}
    assert all(c["audience"] == "none" for c in body["consents"])

    resp = await client.put(
        "/api/v1/consents/me",
        json={"scope": "cycle", "audience": "medic"},
        headers=user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["audience"] == "medic"

    resp = await client.put(
        "/api/v1/consents/me",
        json={"scope": "cycle", "audience": "none"},
        headers=user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["audience"] == "none"


async def test_no_endpoint_exposes_other_athletes_consents(client):
    """Тренеру не должно быть видно, кто согласия не дал — иначе оно не добровольное."""
    user = await register_user(client, "probe@example.com")
    other_id = uuid.uuid4()
    for path in (f"/api/v1/consents/{other_id}", f"/api/v1/consents/athletes/{other_id}"):
        resp = await client.get(path, headers=user["headers"])
        assert resp.status_code == 404, f"{path} не должен существовать"


# ------------------------------------------------------- профиль


async def test_profile_sex_defaults_and_updates(client):
    user = await register_user(client, "sex@example.com")

    resp = await client.put(
        "/api/v1/users/me/profile", json={"position": "нападающий"}, headers=user["headers"]
    )
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["sex"] == Sex.not_specified.value

    resp = await client.put("/api/v1/users/me/profile", json={"sex": "female"}, headers=user["headers"])
    assert resp.status_code in (200, 201)
    assert resp.json()["sex"] == "female"


@pytest.mark.parametrize("payload", [{"position": "вратарь"}, {"sex": None}])
async def test_profile_create_never_nulls_sex(client, payload):
    """Явный null и отсутствие поля одинаково дают not_specified, а не ошибку БД."""
    user = await register_user(client, f"null{abs(hash(str(payload)))}@example.com")
    resp = await client.put("/api/v1/users/me/profile", json=payload, headers=user["headers"])
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["sex"] == Sex.not_specified.value
