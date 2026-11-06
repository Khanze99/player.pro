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


async def build_org(client, sport: str | None = None, suffix: str = ""):
    """Организация: админ, команда, тренер, врач, два игрока; посторонний без организации.

    sport — необязательно, по умолчанию не задан (как у большинства тестов
    команд в проекте); тесты, которым нужен конкретный вид спорта (например
    season-stats), передают его явно.
    suffix — чтобы вызвать build_org несколько раз в одном тесте (две
    независимые организации): без него все идентификаторы/имена фиксированы
    и второй вызов падает на уникальных constraint'ах (email/название).
    """
    admin = await register_user(client, f"admin{suffix}@org.com", device_id=f"device-admin{suffix}-001")
    resp = await client.post(
        "/api/v1/organizations", json={"name": f"FC Test{suffix}"}, headers=admin["headers"]
    )
    assert resp.status_code == 201
    team_payload = {"name": "First Team"} | ({"sport": sport} if sport else {})
    resp = await client.post("/api/v1/teams", json=team_payload, headers=admin["headers"])
    assert resp.status_code == 201
    team_id = resp.json()["id"]

    members = {}
    for key, identifier, role, team_role in [
        ("coach", f"coach{suffix}@org.com", "staff", "coach"),
        ("medic", f"medic{suffix}@org.com", "staff", "medic"),
        ("athlete1", f"a1{suffix}@org.com", "player", "athlete"),
        ("athlete2", f"a2{suffix}@org.com", "player", "athlete"),
    ]:
        resp = await client.post(
            "/api/v1/organizations/invites",
            json={"identifier": identifier, "global_role": role, "team_id": team_id, "team_role": team_role},
            headers=admin["headers"],
        )
        assert resp.status_code == 201, resp.text
        members[key] = await register_user(client, identifier, device_id=f"device-{key}{suffix}-001")

    outsider = await register_user(
        client, f"outsider{suffix}@other.com", device_id=f"device-out{suffix}-0001"
    )
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


async def test_readiness_breakdown_access_matches_view_athlete(client):
    """Разбивка Readiness — та же матрица доступа, что у wellness/metrics: свои данные,
    общая команда для штаба, admin организации; посторонний и чужой игрок — нет."""
    org = await build_org(client)
    resp = await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201
    a1_id = org["athlete1"]["user_id"]
    url = f"/api/v1/analytics/athletes/{a1_id}/readiness-breakdown?day={WELLNESS['date']}"

    resp = await client.get(url, headers=org["athlete1"]["headers"])
    assert resp.status_code == 200
    for who in ("coach", "medic", "admin"):
        resp = await client.get(url, headers=org[who]["headers"])
        assert resp.status_code == 200, f"{who}: {resp.text}"
    resp = await client.get(url, headers=org["athlete2"]["headers"])
    assert resp.status_code == 403
    resp = await client.get(url, headers=org["outsider"]["headers"])
    assert resp.status_code == 403


async def test_medical_exam_write_requires_medic(client):
    """УМО/ТМО (docs/plan-medical-exams.md) — пишет только врач; admin НЕ
    проходит (тот же принцип, что у ensure_can_view_sensitive: админ —
    менеджер клуба, не медработник)."""
    org = await build_org(client)
    a1_id = org["athlete1"]["user_id"]
    payload = {"kind": "umo", "passed_date": str(date.today()), "valid_until": str(date.today())}
    url = f"/api/v1/medical-exams/athletes/{a1_id}"

    resp = await client.post(url, json=payload, headers=org["medic"]["headers"])
    assert resp.status_code == 201

    for who in ("coach", "admin", "athlete1", "outsider"):
        resp = await client.post(url, json=payload, headers=org[who]["headers"])
        assert resp.status_code == 403, f"{who}: {resp.text}"


async def test_medical_exam_read_matches_view_athlete(client):
    org = await build_org(client)
    a1_id = org["athlete1"]["user_id"]
    payload = {"kind": "tmo", "passed_date": str(date.today()), "valid_until": str(date.today())}
    await client.post(
        f"/api/v1/medical-exams/athletes/{a1_id}", json=payload, headers=org["medic"]["headers"]
    )

    url = f"/api/v1/medical-exams/athletes/{a1_id}"
    resp = await client.get(url, headers=org["athlete1"]["headers"])
    assert resp.status_code == 200
    for who in ("coach", "medic", "admin"):
        resp = await client.get(url, headers=org[who]["headers"])
        assert resp.status_code == 200, f"{who}: {resp.text}"
    resp = await client.get(url, headers=org["athlete2"]["headers"])
    assert resp.status_code == 403
    resp = await client.get(url, headers=org["outsider"]["headers"])
    assert resp.status_code == 403


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
