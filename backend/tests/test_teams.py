"""list_my_teams: админ видит и свою организацию, и ручной кросс-орг доступ
(временный путь выдачи — строка в team_memberships на команду чужой организации,
пока нет отдельного флоу, docs/plan-team-selector.md)."""

from app.models.team import TeamMembership
from tests.conftest import register_user


async def test_admin_sees_cross_org_team_via_membership(client, db):
    # Своя организация: админ + команда
    admin = await register_user(client, "admin-a@org.com", device_id="device-admin-a-001")
    resp = await client.post("/api/v1/organizations", json={"name": "Org A"}, headers=admin["headers"])
    assert resp.status_code == 201
    resp = await client.post("/api/v1/teams", json={"name": "Team A1"}, headers=admin["headers"])
    assert resp.status_code == 201

    # Чужая организация с чужой командой
    other_admin = await register_user(client, "admin-b@org.com", device_id="device-admin-b-001")
    resp = await client.post("/api/v1/organizations", json={"name": "Org B"}, headers=other_admin["headers"])
    assert resp.status_code == 201
    resp = await client.post("/api/v1/teams", json={"name": "Team B1"}, headers=other_admin["headers"])
    assert resp.status_code == 201
    team_b1_id = resp.json()["id"]

    # Ручная выдача доступа админу A на команду B1 — тот самый "через базу" путь
    db.add(TeamMembership(user_id=admin["user_id"], team_id=team_b1_id, team_role="coach"))
    await db.commit()

    resp = await client.get("/api/v1/teams", headers=admin["headers"])
    assert resp.status_code == 200
    names = {team["name"] for team in resp.json()}
    assert names == {"Team A1", "Team B1"}


async def test_admin_without_cross_org_membership_sees_only_own_org(client):
    admin = await register_user(client, "admin-solo@org.com", device_id="device-admin-solo-001")
    resp = await client.post("/api/v1/organizations", json={"name": "Org Solo"}, headers=admin["headers"])
    assert resp.status_code == 201
    resp = await client.post("/api/v1/teams", json={"name": "Solo Team"}, headers=admin["headers"])
    assert resp.status_code == 201

    resp = await client.get("/api/v1/teams", headers=admin["headers"])
    assert resp.status_code == 200
    names = {team["name"] for team in resp.json()}
    assert names == {"Solo Team"}


# ------------------------------------------------------------------ короткое имя (шапка с колокольчиком)


async def test_short_name_set_trimmed_and_cleared(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    url = f"/api/v1/teams/{org['team_id']}"
    admin = org["admin"]["headers"]

    resp = await client.patch(url, json={"short_name": "  U-19  "}, headers=admin)
    assert resp.status_code == 200, resp.text
    assert resp.json()["short_name"] == "U-19"
    assert resp.json()["name"] == "First Team"

    # Видно всем участникам через GET /teams.
    teams = (await client.get("/api/v1/teams", headers=org["athlete1"]["headers"])).json()
    assert teams[0]["short_name"] == "U-19"

    # Пустая строка убирает короткое имя.
    resp = await client.patch(url, json={"short_name": ""}, headers=admin)
    assert resp.json()["short_name"] is None

    resp = await client.patch(url, json={"short_name": "x" * 13}, headers=admin)
    assert resp.status_code == 422


async def test_only_own_org_admin_can_update_team(client):
    from tests.test_authz import build_org

    org = await build_org(client)
    other = await build_org(client, suffix="-2")
    url = f"/api/v1/teams/{org['team_id']}"
    for who in ("coach", "medic", "athlete1"):
        resp = await client.patch(url, json={"short_name": "X"}, headers=org[who]["headers"])
        assert resp.status_code == 403, who
    # Админ чужой организации: 404, существование команды не подтверждаем.
    resp = await client.patch(url, json={"short_name": "X"}, headers=other["admin"]["headers"])
    assert resp.status_code == 404
