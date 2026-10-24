"""Расширенный профиль: контакты и роли в /auth/me, антропометрия за согласием,
аватар (приватная раздача + снятие метадаты)."""

import io
import uuid

import pytest
from PIL import Image

from app.config import settings
from app.models.enums import (
    ConsentAudience,
    ConsentScope,
    GlobalRole,
    PolicyConsentKind,
    TeamRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.policy_consent import PolicyConsent
from app.models.team import Team, TeamMembership
from app.models.user import AthleteProfile, User
from app.services import consent_service
from tests.conftest import register_user


def _png(size=(64, 64), color="red") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_with_exif(size=(800, 600)) -> bytes:
    exif = Image.Exif()
    exif[274] = 6  # Orientation
    exif[270] = "секретная база, 55.7558 37.6173"  # ImageDescription — не должно уехать наружу
    buf = io.BytesIO()
    Image.new("RGB", size, "blue").save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


# ------------------------------------------------------------------ /auth/me


async def test_me_exposes_contacts_and_empty_teams_for_personal_user(client):
    user = await register_user(client, "solo@example.com")
    me = (await client.get("/api/v1/auth/me", headers=user["headers"])).json()

    assert me["email"] == "solo@example.com"
    assert me["global_role"] == "player"
    assert me["avatar_url"] is None
    assert me["teams"] == []
    assert "created_at" in me


async def test_me_lists_team_roles(client, db):
    admin = await register_user(client, "boss@example.com")
    await client.post("/api/v1/organizations", json={"name": "Клуб"}, headers=admin["headers"])
    team = await client.post("/api/v1/teams", json={"name": "Основа"}, headers=admin["headers"])
    team_id = team.json()["id"]

    inv = await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": "doc@example.com",
            "name": "Врачёв Пётр",
            "global_role": "staff",
            "team_id": team_id,
            "team_role": "medic",
        },
        headers=admin["headers"],
    )
    assert inv.status_code == 201, inv.text
    medic = await register_user(client, "doc@example.com", device_id="dev-medic")

    me = (await client.get("/api/v1/auth/me", headers=medic["headers"])).json()
    assert me["teams"] == [{"team_id": team_id, "team_name": "Основа", "team_role": "medic"}]


# --------------------------------------------------------- рост/вес в профиле


async def test_profile_accepts_height_and_weight(client):
    user = await register_user(client, "body@example.com")
    resp = await client.put(
        "/api/v1/users/me/profile",
        json={"height_cm": 183, "weight_kg": 78.4},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["height_cm"] == 183
    assert float(resp.json()["weight_kg"]) == 78.4

    got = await client.get("/api/v1/users/me/profile", headers=user["headers"])
    assert got.json()["height_cm"] == 183


@pytest.mark.parametrize("payload", [{"height_cm": 60}, {"height_cm": 300}, {"weight_kg": 10}])
async def test_profile_rejects_out_of_range_body_metrics(client, payload):
    user = await register_user(client, f"bad-{uuid.uuid4().hex[:6]}@example.com")
    resp = await client.put("/api/v1/users/me/profile", json=payload, headers=user["headers"])
    assert resp.status_code == 422, resp.text


# ----------------------------------------- витрина игрока: body_metrics за согласием


async def _club_with_player_and_staff(db) -> dict:
    org = Organization(name="Клуб")
    db.add(org)
    await db.flush()
    team = Team(org_id=org.id, name="Основа")
    db.add(team)
    await db.flush()

    def make(name: str, role: GlobalRole) -> User:
        u = User(
            org_id=org.id,
            last_name=name,
            email=f"{name}-{uuid.uuid4().hex[:8]}@test.com",
            global_role=role,
            status=UserStatus.active,
        )
        db.add(u)
        return u

    athlete = make("player", GlobalRole.player)
    coach = make("coach", GlobalRole.staff)
    medic = make("medic", GlobalRole.staff)
    await db.flush()
    for u, r in [
        (athlete, TeamRole.athlete),
        (coach, TeamRole.head_coach),
        (medic, TeamRole.medic),
    ]:
        db.add(TeamMembership(user_id=u.id, team_id=team.id, team_role=r))
        # юридический гейт онбординга — иначе require_consented режет все /users/*
        for kind, version in (
            (PolicyConsentKind.terms, settings.terms_policy_version),
            (PolicyConsentKind.health_data, settings.health_consent_policy_version),
        ):
            db.add(PolicyConsent(user_id=u.id, kind=kind, policy_version=version))

    db.add(AthleteProfile(user_id=athlete.id, birthdate=None, position="ЦЗ", height_cm=190, weight_kg=85))
    await db.commit()
    return {"team": team, "athlete": athlete, "coach": coach, "medic": medic}


def _token(client, user_id):
    # прямой путь: тесты выше уже используют register_user; здесь нужен доступ
    # от лица заранее созданных в БД пользователей — выдаём access-токен вручную
    from app.core.security import create_access_token

    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


async def test_staff_without_consent_sees_profile_but_not_body_metrics(client, db):
    world = await _club_with_player_and_staff(db)
    resp = await client.get(
        f"/api/v1/users/athletes/{world['athlete'].id}/profile",
        headers=_token(client, world["coach"].id),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["position"] == "ЦЗ"  # обычные поля видны
    assert body["height_cm"] is None  # спецкатегория — нет
    assert body["weight_kg"] is None


async def test_body_metrics_consent_is_medic_scoped(client, db):
    world = await _club_with_player_and_staff(db)
    await consent_service.grant(db, world["athlete"].id, ConsentScope.body_metrics, ConsentAudience.medic)

    medic_view = await client.get(
        f"/api/v1/users/athletes/{world['athlete'].id}/profile",
        headers=_token(client, world["medic"].id),
    )
    assert medic_view.json()["height_cm"] == 190

    coach_view = await client.get(
        f"/api/v1/users/athletes/{world['athlete'].id}/profile",
        headers=_token(client, world["coach"].id),
    )
    assert coach_view.json()["height_cm"] is None  # medic-согласие тренеру не открывает


async def test_athlete_always_sees_own_body_metrics(client, db):
    world = await _club_with_player_and_staff(db)
    resp = await client.get(
        f"/api/v1/users/athletes/{world['athlete'].id}/profile",
        headers=_token(client, world["athlete"].id),
    )
    assert resp.json()["weight_kg"] is not None


# --------------------------------------------------------------- цель веса


async def test_weight_goal_requires_known_weight(client):
    """Нет отметки веса — не от чего снимать точку отсчёта (docs/plan-weight-tracking.md)."""
    user = await register_user(client, "noweight@example.com")
    resp = await client.put(
        "/api/v1/users/me/weight-goal", json={"target_weight_kg": 75}, headers=user["headers"]
    )
    assert resp.status_code == 409, resp.text


async def test_weight_goal_snapshots_current_weight_as_start(client):
    user = await register_user(client, "goalstart@example.com")
    await client.put("/api/v1/users/me/profile", json={"weight_kg": 80.0}, headers=user["headers"])

    resp = await client.put(
        "/api/v1/users/me/weight-goal", json={"target_weight_kg": 75}, headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text
    assert float(resp.json()["start_weight_kg"]) == 80.0
    assert float(resp.json()["target_weight_kg"]) == 75.0

    got = await client.get("/api/v1/users/me/weight-goal", headers=user["headers"])
    assert float(got.json()["start_weight_kg"]) == 80.0


async def test_weight_goal_absent_is_null(client):
    user = await register_user(client, "nogoal@example.com")
    resp = await client.get("/api/v1/users/me/weight-goal", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json() is None


async def test_weight_goal_start_updates_with_current_weight(client):
    """Повторная установка цели пересчитывает точку отсчёта от нового веса,
    не хранит значение первой постановки."""
    user = await register_user(client, "goalupdate@example.com")
    await client.put("/api/v1/users/me/profile", json={"weight_kg": 80.0}, headers=user["headers"])
    await client.put("/api/v1/users/me/weight-goal", json={"target_weight_kg": 75}, headers=user["headers"])

    await client.put("/api/v1/users/me/profile", json={"weight_kg": 78.0}, headers=user["headers"])
    resp = await client.put(
        "/api/v1/users/me/weight-goal", json={"target_weight_kg": 74}, headers=user["headers"]
    )
    assert float(resp.json()["start_weight_kg"]) == 78.0
    assert float(resp.json()["target_weight_kg"]) == 74.0


async def test_weight_goal_gated_by_body_metrics_consent(client, db):
    """Тот же гейт, что у weight_kg самого: нет согласия → null, не 403 —
    формулировка не должна различать «нет согласия» и «нет цели»."""
    world = await _club_with_player_and_staff(db)
    athlete_id = world["athlete"].id
    set_goal = await client.put(
        "/api/v1/users/me/weight-goal",
        json={"target_weight_kg": 80},
        headers=_token(client, athlete_id),
    )
    assert set_goal.status_code == 200, set_goal.text

    coach_before = await client.get(
        f"/api/v1/users/athletes/{athlete_id}/weight-goal", headers=_token(client, world["coach"].id)
    )
    assert coach_before.status_code == 200
    assert coach_before.json() is None  # нет согласия

    await consent_service.grant(db, athlete_id, ConsentScope.body_metrics, ConsentAudience.coach)
    coach_after = await client.get(
        f"/api/v1/users/athletes/{athlete_id}/weight-goal", headers=_token(client, world["coach"].id)
    )
    assert float(coach_after.json()["target_weight_kg"]) == 80.0

    self_view = await client.get(
        f"/api/v1/users/athletes/{athlete_id}/weight-goal", headers=_token(client, athlete_id)
    )
    assert float(self_view.json()["target_weight_kg"]) == 80.0


# ------------------------------------------------------------------- аватар


async def test_avatar_upload_download_delete_roundtrip(client):
    user = await register_user(client, "face@example.com")

    up = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("me.png", _png(), "image/png")},
        headers=user["headers"],
    )
    assert up.status_code == 200, up.text
    assert up.json()["avatar_url"] == f"/api/v1/users/{user['user_id']}/avatar"

    got = await client.get(f"/api/v1/users/{user['user_id']}/avatar", headers=user["headers"])
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/webp"

    dele = await client.delete("/api/v1/users/me/avatar", headers=user["headers"])
    assert dele.status_code == 204
    gone = await client.get(f"/api/v1/users/{user['user_id']}/avatar", headers=user["headers"])
    assert gone.status_code == 404


async def test_avatar_is_squared_and_stripped_of_metadata(client):
    user = await register_user(client, "exif@example.com")
    up = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("photo.jpg", _jpeg_with_exif((800, 600)), "image/jpeg")},
        headers=user["headers"],
    )
    assert up.status_code == 200, up.text

    raw = (await client.get(f"/api/v1/users/{user['user_id']}/avatar", headers=user["headers"])).content
    out = Image.open(io.BytesIO(raw))
    assert out.format == "WEBP"
    assert out.size == (512, 512)  # обрезано в квадрат
    assert dict(out.getexif()) == {}  # метадата снята


async def test_avatar_rejects_non_image(client):
    user = await register_user(client, "nope@example.com")

    wrong_type = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("a.txt", b"hello", "text/plain")},
        headers=user["headers"],
    )
    assert wrong_type.status_code == 400

    garbage = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("a.png", b"not really a png", "image/png")},
        headers=user["headers"],
    )
    assert garbage.status_code == 400


async def test_avatar_rejects_oversize(client, monkeypatch):
    from app.services import avatar_service

    monkeypatch.setattr(avatar_service.settings, "avatar_max_upload_bytes", 10)
    user = await register_user(client, "big@example.com")
    resp = await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("me.png", _png((128, 128)), "image/png")},
        headers=user["headers"],
    )
    assert resp.status_code == 413


async def test_avatar_visible_to_teammate_not_to_stranger(client, db):
    world = await _club_with_player_and_staff(db)
    # игрок ставит себе аватар
    await client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("p.png", _png(), "image/png")},
        headers=_token(client, world["athlete"].id),
    )

    teammate = await client.get(
        f"/api/v1/users/{world['athlete'].id}/avatar",
        headers=_token(client, world["coach"].id),
    )
    assert teammate.status_code == 200

    stranger = await register_user(client, "stranger@example.com", device_id="dev-strange")
    resp = await client.get(f"/api/v1/users/{world['athlete'].id}/avatar", headers=stranger["headers"])
    assert resp.status_code == 403
