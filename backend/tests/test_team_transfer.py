"""Перевод игрока между командами организации (docs/plan-player-transfer.md).

Только admin организации, только внутри своей организации (обе команды сверяются —
иначе IDOR в чужой тенант), жёсткий перевод в одной транзакции + запись в AuditLog.
"""

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.team import TeamMembership
from tests.conftest import register_user


async def _build_org(client, admin_identifier: str, org_name: str) -> dict:
    admin = await register_user(client, admin_identifier, device_id=f"device-{admin_identifier}")
    resp = await client.post("/api/v1/organizations", json={"name": org_name}, headers=admin["headers"])
    assert resp.status_code == 201
    return admin


async def _create_team(client, admin: dict, name: str) -> str:
    resp = await client.post("/api/v1/teams", json={"name": name}, headers=admin["headers"])
    assert resp.status_code == 201
    return resp.json()["id"]


async def _invite_and_register(client, admin: dict, identifier: str, team_id: str, team_role: str) -> dict:
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": identifier, "global_role": "player", "team_id": team_id, "team_role": team_role},
        headers=admin["headers"],
    )
    assert resp.status_code == 201, resp.text
    return await register_user(client, identifier, device_id=f"device-{identifier}")


async def test_admin_transfers_player_keeping_role(client, db):
    admin = await _build_org(client, "admin-tr-1@org.com", "Org TR1")
    team_a = await _create_team(client, admin, "Молодёжка")
    team_b = await _create_team(client, admin, "Основа")
    player = await _invite_and_register(client, admin, "player-tr-1@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b},
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["team_role"] == "athlete"
    assert body["user_id"] == player["user_id"]
    assert "since" in body

    old = await db.get(TeamMembership, (player["user_id"], team_a))
    new = await db.get(TeamMembership, (player["user_id"], team_b))
    assert old is None
    assert new is not None
    assert new.team_role == "athlete"


async def test_admin_transfers_with_explicit_role_override(client):
    admin = await _build_org(client, "admin-tr-2@org.com", "Org TR2")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    player = await _invite_and_register(client, admin, "player-tr-2@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b, "team_role": "coach"},
        headers=admin["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["team_role"] == "coach"


async def test_transfer_writes_audit_log(client, db):
    admin = await _build_org(client, "admin-tr-3@org.com", "Org TR3")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    player = await _invite_and_register(client, admin, "player-tr-3@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b, "reason": "просмотр в основе"},
        headers=admin["headers"],
    )
    assert resp.status_code == 200

    rows = await db.execute(
        select(AuditLog).where(AuditLog.action == "team.transfer", AuditLog.resource_id == player["user_id"])
    )
    log = rows.scalar_one()
    assert str(log.actor_id) == admin["user_id"]
    assert log.detail["from_team_id"] == team_a
    assert log.detail["to_team_id"] == team_b
    assert log.detail["reason"] == "просмотр в основе"


async def test_staff_cannot_transfer(client):
    admin = await _build_org(client, "admin-tr-4@org.com", "Org TR4")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    player = await _invite_and_register(client, admin, "player-tr-4@org.com", team_a, "athlete")
    coach = await _invite_and_register(client, admin, "coach-tr-4@org.com", team_a, "head_coach")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b},
        headers=coach["headers"],
    )
    assert resp.status_code == 403


async def test_player_cannot_transfer(client):
    admin = await _build_org(client, "admin-tr-5@org.com", "Org TR5")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    player = await _invite_and_register(client, admin, "player-tr-5@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b},
        headers=player["headers"],
    )
    assert resp.status_code == 403


async def test_cannot_transfer_into_foreign_org_team(client):
    """IDOR: команда-получатель принадлежит другой организации — 404, не 403/200."""
    admin_a = await _build_org(client, "admin-tr-6a@org.com", "Org TR6A")
    team_a = await _create_team(client, admin_a, "Команда А")
    player = await _invite_and_register(client, admin_a, "player-tr-6@org.com", team_a, "athlete")

    admin_b = await _build_org(client, "admin-tr-6b@org.com", "Org TR6B")
    team_foreign = await _create_team(client, admin_b, "Чужая команда")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_foreign},
        headers=admin_a["headers"],
    )
    assert resp.status_code == 404


async def test_cannot_transfer_from_foreign_org_team(client):
    """IDOR: команда-источник принадлежит другой организации — 404."""
    admin_a = await _build_org(client, "admin-tr-7a@org.com", "Org TR7A")
    team_own = await _create_team(client, admin_a, "Своя команда")

    admin_b = await _build_org(client, "admin-tr-7b@org.com", "Org TR7B")
    team_foreign = await _create_team(client, admin_b, "Чужая команда")
    player = await _invite_and_register(client, admin_b, "player-tr-7@org.com", team_foreign, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_foreign}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_own},
        headers=admin_a["headers"],
    )
    assert resp.status_code == 404


async def test_conflict_when_already_in_target_team(client):
    admin = await _build_org(client, "admin-tr-8@org.com", "Org TR8")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    player = await _invite_and_register(client, admin, "player-tr-8@org.com", team_a, "athlete")

    resp = await client.put(
        f"/api/v1/teams/{team_b}/members",
        json={"user_id": player["user_id"], "team_role": "athlete"},
        headers=admin["headers"],
    )
    assert resp.status_code == 204

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b},
        headers=admin["headers"],
    )
    assert resp.status_code == 409


async def test_unprocessable_when_source_equals_target(client):
    admin = await _build_org(client, "admin-tr-9@org.com", "Org TR9")
    team_a = await _create_team(client, admin, "Команда А")
    player = await _invite_and_register(client, admin, "player-tr-9@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_a},
        headers=admin["headers"],
    )
    assert resp.status_code == 422


async def test_not_found_when_player_not_in_source_team(client):
    admin = await _build_org(client, "admin-tr-10@org.com", "Org TR10")
    team_a = await _create_team(client, admin, "Команда А")
    team_b = await _create_team(client, admin, "Команда Б")
    team_c = await _create_team(client, admin, "Команда В")
    player = await _invite_and_register(client, admin, "player-tr-10@org.com", team_a, "athlete")

    resp = await client.post(
        f"/api/v1/teams/{team_b}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_c},
        headers=admin["headers"],
    )
    assert resp.status_code == 404
