"""Матрица доступа (раздел 2.4 ТЗ): athlete — только своё, staff — команда, admin — организация."""

from datetime import date

from tests.conftest import register_user

WELLNESS = {
    "date": str(date.today()),
    "mood": 4,
    "energy": 4,
    "sleep_quality": 5,
    "stress": 2,
    "soreness": 2,
}


async def build_org(client):
    """Организация: админ, команда, тренер, врач, два игрока; посторонний без организации."""
    admin = await register_user(client, "admin@org.com", device_id="device-admin-001")
    resp = await client.post("/api/v1/organizations", json={"name": "FC Test"}, headers=admin["headers"])
    assert resp.status_code == 201
    resp = await client.post("/api/v1/teams", json={"name": "First Team"}, headers=admin["headers"])
    assert resp.status_code == 201
    team_id = resp.json()["id"]

    members = {}
    for key, identifier, role, team_role in [
        ("coach", "coach@org.com", "staff", "coach"),
        ("medic", "medic@org.com", "staff", "medic"),
        ("athlete1", "a1@org.com", "player", "athlete"),
        ("athlete2", "a2@org.com", "player", "athlete"),
    ]:
        resp = await client.post(
            "/api/v1/organizations/invites",
            json={"identifier": identifier, "global_role": role, "team_id": team_id, "team_role": team_role},
            headers=admin["headers"],
        )
        assert resp.status_code == 201, resp.text
        members[key] = await register_user(client, identifier, device_id=f"device-{key}-001")

    outsider = await register_user(client, "outsider@other.com", device_id="device-out-0001")
    return {"admin": admin, "team_id": team_id, "outsider": outsider, **members}


async def test_athlete_sees_only_own_wellness(client):
    org = await build_org(client)
    resp = await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201

    a1_id = org["athlete1"]["user_id"]
    # Сам себя — можно
    resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["athlete1"]["headers"])
    assert resp.status_code == 200
    # Другой игрок — нельзя
    resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["athlete2"]["headers"])
    assert resp.status_code == 403
    # Посторонний — нельзя
    resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["outsider"]["headers"])
    assert resp.status_code == 403


async def test_staff_and_admin_see_team_athlete(client):
    org = await build_org(client)
    await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    a1_id = org["athlete1"]["user_id"]
    for who in ("coach", "medic", "admin"):
        resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org[who]["headers"])
        assert resp.status_code == 200, f"{who}: {resp.text}"


async def test_dashboard_access(client):
    org = await build_org(client)
    url = f"/api/v1/dashboard/teams/{org['team_id']}/squad-status"
    assert (await client.get(url, headers=org["coach"]["headers"])).status_code == 200
    assert (await client.get(url, headers=org["medic"]["headers"])).status_code == 200
    assert (await client.get(url, headers=org["admin"]["headers"])).status_code == 200
    assert (await client.get(url, headers=org["athlete1"]["headers"])).status_code == 403
    assert (await client.get(url, headers=org["outsider"]["headers"])).status_code == 403


async def test_availability_write_rules(client):
    org = await build_org(client)
    payload = {"athlete_id": org["athlete1"]["user_id"], "date": str(date.today()), "status": "modified"}
    # Врач и тренер — можно
    assert (
        await client.put("/api/v1/availability", json=payload, headers=org["medic"]["headers"])
    ).status_code == 200
    assert (
        await client.put("/api/v1/availability", json=payload, headers=org["coach"]["headers"])
    ).status_code == 200
    # Игрок (даже про себя) и посторонний — нельзя
    assert (
        await client.put("/api/v1/availability", json=payload, headers=org["athlete1"]["headers"])
    ).status_code == 403
    assert (
        await client.put("/api/v1/availability", json=payload, headers=org["outsider"]["headers"])
    ).status_code == 403


async def test_team_management_requires_admin(client):
    org = await build_org(client)
    resp = await client.post("/api/v1/teams", json={"name": "B Team"}, headers=org["coach"]["headers"])
    assert resp.status_code == 403
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": "new@org.com"},
        headers=org["athlete1"]["headers"],
    )
    assert resp.status_code == 403


async def test_duplicate_wellness_conflict(client):
    org = await build_org(client)
    assert (
        await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    ).status_code == 201
    assert (
        await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    ).status_code == 409
