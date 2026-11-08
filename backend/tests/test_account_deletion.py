"""Удаление аккаунта самим пользователем и ревью-вход для сторов
(docs/plan-legal-texts.md, раздел «Минимум к релизу в сторы»)."""

import io
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import func, select

from app.config import Settings, settings
from app.database import Base
from app.models.audit import AuditLog
from app.models.consent import DataConsent
from app.models.enums import (
    ConsentAudience,
    ConsentScope,
    FoodSource,
    GlobalRole,
    InvitationStatus,
    UserStatus,
)
from app.models.event import Event
from app.models.injury import InjuryRecord
from app.models.invitation import Invitation
from app.models.nutrition import FoodItem
from app.models.policy_consent import PolicyConsent
from app.models.rpe import RpeEntry
from app.models.team import TeamMembership
from app.models.user import RefreshToken, User
from app.models.wellness import WellnessEntry
from app.services import account_deletion_service, avatar_service
from tests.conftest import register_user
from tests.test_authz import WELLNESS, build_org


async def _count(db, model, column, value) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(column == value))


async def _create_team_event(client, headers, team_id: str) -> dict:
    start = datetime.now(UTC) - timedelta(hours=3)
    resp = await client.post(
        "/api/v1/events",
        json={
            "type": "training",
            "title": "Утренняя",
            "team_id": team_id,
            "planned_start": start.isoformat(),
            "planned_duration_min": 60,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------- удаление игрока


async def test_delete_wipes_personal_and_health_data_and_leaves_tombstone(client, db):
    org = await build_org(client)
    athlete = org["athlete1"]
    athlete_id = uuid.UUID(athlete["user_id"])

    resp = await client.post(
        "/api/v1/wellness",
        json=WELLNESS | {"pain_points": [{"region": "knee", "side": "left", "severity": 3}]},
        headers=athlete["headers"],
    )
    assert resp.status_code == 201, resp.text
    resp = await client.post(
        "/api/v1/injuries",
        json={
            "athlete_id": str(athlete_id),
            "type": "Растяжение",
            "severity": "minor",
            "start_date": str(date.today()),
        },
        headers=org["medic"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = await client.delete("/api/v1/account", headers=athlete["headers"])
    assert resp.status_code == 204, resp.text

    db.expire_all()
    user = await db.get(User, athlete_id)
    assert user is not None, "строка users остаётся надгробием"
    assert user.status == UserStatus.deleted
    assert (user.first_name, user.last_name, user.middle_name) == ("", "", "")
    assert user.email is None and user.phone is None
    assert user.avatar_path is None and user.org_id is None
    assert user.global_role == GlobalRole.player

    assert await _count(db, WellnessEntry, WellnessEntry.athlete_id, athlete_id) == 0
    assert await _count(db, InjuryRecord, InjuryRecord.athlete_id, athlete_id) == 0
    assert await _count(db, TeamMembership, TeamMembership.user_id, athlete_id) == 0
    assert await _count(db, RefreshToken, RefreshToken.user_id, athlete_id) == 0

    # История согласий не удаляется, а закрывается
    consents = (await db.scalars(select(PolicyConsent).where(PolicyConsent.user_id == athlete_id))).all()
    assert consents and all(c.revoked_at is not None for c in consents)

    # Аудит без ПДн: только id
    audit = await db.scalar(
        select(AuditLog).where(AuditLog.action == "user.delete", AuditLog.actor_id == athlete_id)
    )
    assert audit is not None and audit.detail == {}


async def test_deleted_user_access_and_refresh_tokens_stop_working(client):
    user = await register_user(client, "gone@example.com")
    resp = await client.delete("/api/v1/account", headers=user["headers"])
    assert resp.status_code == 204

    resp = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert resp.status_code == 401
    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": user["refresh"], "device_id": "test-device-0001"},
    )
    assert resp.status_code == 401


async def test_same_identifier_registers_a_fresh_account(client):
    first = await register_user(client, "again@example.com")
    resp = await client.delete("/api/v1/account", headers=first["headers"])
    assert resp.status_code == 204

    second = await register_user(client, "again@example.com", device_id="test-device-0002")
    assert second["user_id"] != first["user_id"]
    me = await client.get("/api/v1/auth/me", headers=second["headers"])
    assert me.status_code == 200
    assert me.json()["teams"] == [] and me.json()["org_id"] is None


async def test_delete_works_without_policy_consent(client):
    """Экран consent → «Не согласен, удалить аккаунт»: гейт на удаление не вешается."""
    identifier = "refuse@example.com"
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
    code = resp.json()["debug_code"]
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": identifier, "code": code, "device_id": "test-device-0001"},
    )
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    resp = await client.delete("/api/v1/account", headers=headers)
    assert resp.status_code == 204


async def test_delete_requires_auth(client):
    resp = await client.delete("/api/v1/account")
    assert resp.status_code == 401


async def test_invitations_to_deleted_identifier_are_removed(client, db):
    """identifier приглашения: телефон/email человека (ПДн), не FK: удаляем явно."""
    org = await build_org(client)
    assert await _count(db, Invitation, Invitation.identifier, "a1@org.com") == 1
    resp = await client.delete("/api/v1/account", headers=org["athlete1"]["headers"])
    assert resp.status_code == 204
    assert await _count(db, Invitation, Invitation.identifier, "a1@org.com") == 0


# ---------------------------------------------------------------- удаление штаба


async def test_deleting_coach_keeps_team_events_and_other_players_rpe(client, db):
    org = await build_org(client)
    coach_id = uuid.UUID(org["coach"]["user_id"])
    event = await _create_team_event(client, org["coach"]["headers"], org["team_id"])
    resp = await client.post(
        "/api/v1/rpe",
        json={
            "date": str(date.today()),
            "exertion": 7,
            "performance": 5,
            "duration_min": 60,
            "event_id": event["id"],
        },
        headers=org["athlete2"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = await client.delete("/api/v1/account", headers=org["coach"]["headers"])
    assert resp.status_code == 204

    db.expire_all()
    kept = await db.get(Event, uuid.UUID(event["id"]))
    assert kept is not None and kept.created_by == coach_id
    athlete2_id = uuid.UUID(org["athlete2"]["user_id"])
    assert await _count(db, RpeEntry, RpeEntry.athlete_id, athlete2_id) == 1

    # Тренер пропал из состава команды
    resp = await client.get(f"/api/v1/teams/{org['team_id']}/members", headers=org["admin"]["headers"])
    assert resp.status_code == 200, resp.text
    assert str(coach_id) not in {m["user_id"] for m in resp.json()}


async def test_injury_recorded_by_deleted_medic_stays_with_athlete(client, db):
    org = await build_org(client)
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    resp = await client.post(
        "/api/v1/injuries",
        json={
            "athlete_id": str(athlete_id),
            "type": "Ушиб",
            "severity": "minor",
            "start_date": str(date.today()),
        },
        headers=org["medic"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = await client.delete("/api/v1/account", headers=org["medic"]["headers"])
    assert resp.status_code == 204
    assert await _count(db, InjuryRecord, InjuryRecord.athlete_id, athlete_id) == 1


async def test_sole_org_admin_with_members_gets_409(client, db):
    org = await build_org(client)
    resp = await client.delete("/api/v1/account", headers=org["admin"]["headers"])
    assert resp.status_code == 409
    assert resp.json()["detail"] == account_deletion_service.LAST_ORG_ADMIN_DETAIL

    db.expire_all()
    admin = await db.get(User, uuid.UUID(org["admin"]["user_id"]))
    assert admin.status == UserStatus.active


async def test_org_admin_without_other_members_can_delete(client):
    admin = await register_user(client, "lonely-admin@example.com")
    resp = await client.post("/api/v1/organizations", json={"name": "Solo FC"}, headers=admin["headers"])
    assert resp.status_code == 201
    resp = await client.delete("/api/v1/account", headers=admin["headers"])
    assert resp.status_code == 204


# ---------------------------------------------------------------- скрипт по запросу с почты


async def test_find_by_identifier_normalizes_like_login(client, db):
    user = await register_user(client, "Script@Example.com")
    found = await account_deletion_service.find_by_identifier(db, "  script@example.com ")
    assert found is not None and str(found.id) == user["user_id"]


# ---------------------------------------------------------------- ревью-вход


async def test_review_login_disabled_by_default(client, monkeypatch):
    # Дефолт класса, а не живые настройки: локальный backend/.env может включать вход
    assert Settings.model_fields["review_login_identifiers"].default == ""
    assert Settings.model_fields["review_otp_code"].default == ""
    monkeypatch.setattr(settings, "review_login_identifiers", "")
    monkeypatch.setattr(settings, "review_otp_code", "")
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "review@player-pro.ru"})
    assert resp.status_code == 200
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "review@player-pro.ru", "code": "482913", "device_id": "review-device-01"},
    )
    assert resp.status_code == 400


async def test_review_login_accepts_fixed_code_only_for_its_identifier(client, monkeypatch):
    monkeypatch.setattr(settings, "review_login_identifiers", " Review@Player-Pro.ru , coach@player-pro.ru")
    monkeypatch.setattr(settings, "review_otp_code", "482913")

    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "review@player-pro.ru"})
    assert resp.status_code == 200
    assert resp.json().get("debug_code") is None, "фиксированный код не светится в ответе"
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "review@player-pro.ru", "code": "482913", "device_id": "review-device-01"},
    )
    assert resp.status_code == 200, resp.text

    # Для любого другого идентификатора фиксированный код не работает
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "someone@example.com"})
    assert resp.status_code == 200
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "someone@example.com", "code": "482913", "device_id": "other-device-01"},
    )
    assert resp.status_code == 400


async def test_review_login_still_limits_attempts(client, monkeypatch):
    monkeypatch.setattr(settings, "review_login_identifiers", "review@player-pro.ru")
    monkeypatch.setattr(settings, "review_otp_code", "482913")

    await client.post("/api/v1/auth/otp/request", json={"identifier": "review@player-pro.ru"})
    for _ in range(settings.otp_max_attempts):
        resp = await client.post(
            "/api/v1/auth/otp/verify",
            json={"identifier": "review@player-pro.ru", "code": "000000", "device_id": "review-device-01"},
        )
        assert resp.status_code == 400
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "review@player-pro.ru", "code": "482913", "device_id": "review-device-01"},
    )
    assert resp.status_code == 400, "после исчерпания попыток верный код тоже не принимается"


async def test_review_login_accepts_every_listed_identifier(client, monkeypatch):
    monkeypatch.setattr(
        settings, "review_login_identifiers", "review-player@player-pro.ru,review-coach@player-pro.ru"
    )
    monkeypatch.setattr(settings, "review_otp_code", "000000")
    for n, identifier in enumerate(("review-player@player-pro.ru", "review-coach@player-pro.ru")):
        resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
        assert resp.status_code == 200
        resp = await client.post(
            "/api/v1/auth/otp/verify",
            json={"identifier": identifier, "code": "000000", "device_id": f"review-device-0{n}"},
        )
        assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------- проверка конфига ревью-входа


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_review_config_empty_is_valid_and_disabled():
    s = _settings(review_login_identifiers="", review_otp_code="")
    assert s.review_logins == frozenset()


def test_review_config_normalizes_list():
    s = _settings(review_login_identifiers=" A@Player-Pro.ru ,b@player-pro.ru,", review_otp_code="000000")
    assert s.review_logins == frozenset({"a@player-pro.ru", "b@player-pro.ru"})


@pytest.mark.parametrize(
    ("identifiers", "code"),
    [
        ("review@player-pro.ru", ""),  # только адрес
        ("", "000000"),  # только код
        ("review@player-pro.ru", "12345"),  # код не 6 цифр
        ("review@player-pro.ru", "12a456"),  # код не цифры
        ("review", "000000"),  # опечатка: не email
        ("someone@gmail.com", "000000"),  # чужой домен: реальный человек
        ("review@player-pro.ru.evil.com", "000000"),
    ],
)
def test_review_config_rejects_bad_values_at_startup(identifiers, code):
    """Ошибка в .env роняет старт API, а не вход всех пользователей."""
    with pytest.raises(ValidationError):
        _settings(review_login_identifiers=identifiers, review_otp_code=code)


# ---------------------------------------------------------------- полнота удаления


def test_every_fk_to_users_is_deleted_or_explicitly_kept():
    """Новая таблица со ссылкой на users.id должна попасть либо в OWNED (удаляется),
    либо в KEPT_REFERENCES (остаётся за надгробием, с причиной). Иначе её данные
    молча переживут удаление аккаунта."""
    owned = {f"{column.table.name}.{column.name}" for _, column in account_deletion_service.OWNED}
    # Личные события удаляются отдельным условием (team_id IS NULL), командные остаются
    owned_or_kept = owned | set(account_deletion_service.KEPT_REFERENCES)
    refs = {
        f"{table.name}.{fk.parent.name}"
        for table in Base.metadata.sorted_tables
        for fk in table.foreign_keys
        if fk.column.table.name == "users" and fk.column.name == "id"
    }
    missing = refs - owned_or_kept
    assert not missing, f"FK на users.id без решения об удалении: {sorted(missing)}"
    assert not (owned & set(account_deletion_service.KEPT_REFERENCES)), "колонка и в OWNED, и в KEPT"


async def test_personal_events_deleted_team_events_kept(client, db):
    org = await build_org(client)
    athlete = org["athlete1"]
    athlete_id = uuid.UUID(athlete["user_id"])
    start = datetime.now(UTC) + timedelta(days=1)
    resp = await client.post(
        "/api/v1/events",
        json={
            "type": "individual",
            "title": "Реабилитация колена, физио",
            "planned_start": start.isoformat(),
            "planned_duration_min": 45,
        },
        headers=athlete["headers"],
    )
    assert resp.status_code == 201, resp.text
    team_event = await _create_team_event(client, org["coach"]["headers"], org["team_id"])

    resp = await client.delete("/api/v1/account", headers=athlete["headers"])
    assert resp.status_code == 204

    db.expire_all()
    assert await _count(db, Event, Event.created_by, athlete_id) == 0
    assert await db.get(Event, uuid.UUID(team_event["id"])) is not None


async def test_custom_food_items_are_deleted(client, db):
    user = await register_user(client, "eater@example.com")
    user_id = uuid.UUID(user["user_id"])
    db.add(FoodItem(source=FoodSource.custom, name="Мамины котлеты", kcal_100g=250, created_by=user_id))
    shared_id = uuid.uuid4()
    db.add(FoodItem(id=shared_id, source=FoodSource.curated, name="Гречка", kcal_100g=330))
    await db.commit()

    resp = await client.delete("/api/v1/account", headers=user["headers"])
    assert resp.status_code == 204
    db.expire_all()
    assert await _count(db, FoodItem, FoodItem.created_by, user_id) == 0
    assert await db.get(FoodItem, shared_id) is not None, "общий справочник не трогаем"


async def test_audit_details_about_deleted_user_are_redacted(client, db):
    org = await build_org(client)
    athlete_id = org["athlete1"]["user_id"]
    other_id = org["athlete2"]["user_id"]
    for target in (athlete_id, other_id):
        resp = await client.put(
            "/api/v1/availability",
            json={"athlete_id": target, "date": str(date.today()), "status": "unavailable"},
            headers=org["medic"]["headers"],
        )
        assert resp.status_code == 200, resp.text
    resp = await client.post(
        "/api/v1/injuries",
        json={
            "athlete_id": athlete_id,
            "type": "Разрыв ПКС",
            "severity": "severe",
            "start_date": str(date.today()),
        },
        headers=org["medic"]["headers"],
    )
    assert resp.status_code == 201, resp.text
    injury_id = resp.json()["id"]

    resp = await client.delete("/api/v1/account", headers=org["athlete1"]["headers"])
    assert resp.status_code == 204

    db.expire_all()
    mine = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == athlete_id))).all()
    assert mine and all(row.detail == {} for row in mine)
    injury_log = await db.scalar(select(AuditLog).where(AuditLog.resource_id == injury_id))
    assert injury_log is not None and injury_log.detail == {}, "диагноз из журнала вычищен"
    # Факт действия остался: кто и когда
    availability = [row for row in mine if row.action == "availability.set"]
    assert availability and all(row.actor_id == uuid.UUID(org["medic"]["user_id"]) for row in availability)
    # Записи о другом игроке не тронуты
    other = await db.scalar(select(AuditLog).where(AuditLog.resource_id == other_id))
    assert other.detail.get("status") == "unavailable"


async def test_data_consents_are_revoked_not_deleted(client, db):
    user = await register_user(client, "sharer@example.com")
    user_id = uuid.UUID(user["user_id"])
    db.add(
        DataConsent(
            athlete_id=user_id,
            scope=ConsentScope.body_metrics,
            audience=ConsentAudience.coach,
            policy_version=settings.consent_policy_version,
        )
    )
    await db.commit()

    resp = await client.delete("/api/v1/account", headers=user["headers"])
    assert resp.status_code == 204
    db.expire_all()
    rows = (await db.scalars(select(DataConsent).where(DataConsent.athlete_id == user_id))).all()
    assert rows and all(row.revoked_at is not None for row in rows)


async def test_avatar_files_are_removed_from_disk(client):
    user = await register_user(client, "selfie@example.com")
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), "red").save(buf, format="PNG")
    resp = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("me.png", buf.getvalue(), "image/png")},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    pattern = f"{user['user_id']}_*.webp"
    assert list(avatar_service.avatars_dir().glob(pattern))

    resp = await client.delete("/api/v1/account", headers=user["headers"])
    assert resp.status_code == 204
    assert not list(avatar_service.avatars_dir().glob(pattern))


async def test_last_admin_deletion_revokes_pending_invitations(client, db):
    admin = await register_user(client, "founder@example.com")
    resp = await client.post("/api/v1/organizations", json={"name": "Ghost FC"}, headers=admin["headers"])
    assert resp.status_code == 201
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": "invitee@example.com", "global_role": "player"},
        headers=admin["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = await client.delete("/api/v1/account", headers=admin["headers"])
    assert resp.status_code == 204
    db.expire_all()
    invite = await db.scalar(select(Invitation).where(Invitation.identifier == "invitee@example.com"))
    assert invite.status == InvitationStatus.revoked

    # Приглашённый входит как обычный новый пользователь, без организации
    newcomer = await register_user(client, "invitee@example.com", device_id="test-device-0009")
    me = await client.get("/api/v1/auth/me", headers=newcomer["headers"])
    assert me.json()["org_id"] is None


async def test_repeat_deletion_of_tombstone_is_safe(client, db):
    user = await register_user(client, "twice@example.com")
    user_id = uuid.UUID(user["user_id"])
    resp = await client.delete("/api/v1/account", headers=user["headers"])
    assert resp.status_code == 204

    db.expire_all()
    tombstone = await db.get(User, user_id)
    await account_deletion_service.delete_account(db, tombstone)  # scripts/delete_account.py --user-id
    db.expire_all()
    assert (await db.get(User, user_id)).status == UserStatus.deleted
