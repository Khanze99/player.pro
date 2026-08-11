"""Профиль пользователя: ФИО раздельными полями, строка для списков собирается на выдаче."""

from tests.conftest import register_user


async def test_update_full_name_trims_parts(client):
    user = await register_user(client, "fio@example.com")

    resp = await client.patch(
        "/api/v1/users/me",
        json={"last_name": " Хамидов ", "first_name": "Алексей", "middle_name": "Русланович"},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["last_name"] == "Хамидов"  # пробелы по краям срезаются
    assert body["first_name"] == "Алексей"
    assert body["middle_name"] == "Русланович"


async def test_partial_name_update_keeps_other_parts(client):
    user = await register_user(client, "fio2@example.com")
    await client.patch(
        "/api/v1/users/me",
        json={"last_name": "Петров", "first_name": "Иван"},
        headers=user["headers"],
    )

    resp = await client.patch("/api/v1/users/me", json={"last_name": "Сидоров"}, headers=user["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["last_name"] == "Сидоров"
    assert resp.json()["first_name"] == "Иван"


async def test_locale_update_keeps_full_name(client):
    user = await register_user(client, "fio3@example.com")
    await client.patch(
        "/api/v1/users/me",
        json={"last_name": "Орлов", "first_name": "Максим"},
        headers=user["headers"],
    )

    resp = await client.patch("/api/v1/users/me", json={"locale": "en"}, headers=user["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["locale"] == "en"
    assert resp.json()["last_name"] == "Орлов"


async def test_empty_profile_is_not_an_error(client):
    """Новый игрок ещё не заполнял профиль — это состояние, а не 404."""
    user = await register_user(client, "noprofile@example.com")

    resp = await client.get("/api/v1/users/me/profile", headers=user["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["sex"] == "not_specified"
    assert resp.json()["position"] is None


async def test_roster_shows_last_name_first(client):
    """В списках человек — «Фамилия Имя»: отчество не показываем, сортировка по фамилии."""
    admin = await register_user(client, "coach@example.com")
    await client.patch(
        "/api/v1/users/me",
        json={"last_name": "Ярцев", "first_name": "Пётр", "middle_name": "Ильич"},
        headers=admin["headers"],
    )
    org = await client.post("/api/v1/organizations", json={"name": "FC Test"}, headers=admin["headers"])
    assert org.status_code == 201, org.text
    team = await client.post("/api/v1/teams", json={"name": "Team A"}, headers=admin["headers"])
    assert team.status_code == 201, team.text

    inv = await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": "athlete@example.com",
            "name": "Абросимов Илья",
            "global_role": "player",
            "team_id": team.json()["id"],
            "team_role": "athlete",
        },
        headers=admin["headers"],
    )
    assert inv.status_code == 201, inv.text
    await register_user(client, "athlete@example.com", device_id="dev-athlete")

    members = await client.get(f"/api/v1/teams/{team.json()['id']}/members", headers=admin["headers"])
    assert members.status_code == 200, members.text
    assert [m["name"] for m in members.json()] == ["Абросимов Илья", "Ярцев Пётр"]
