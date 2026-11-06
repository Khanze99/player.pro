"""Статистика по сезонам (docs/plan-player-season-stats.md): доступ, per-90/%,
валидация каталога метрик, CRUD."""

from tests.test_authz import build_org

PAYLOAD = {
    "season": "2025/26",
    "team_label": "Основа",
    "matches": 10,
    "minutes": 900,
    "score": 9,
    "assists": 3,
    "values": {"shots": 20, "shots_on_target": 10},
}


async def _create(client, headers, athlete_id, **overrides):
    body = {**PAYLOAD, "athlete_id": athlete_id, **overrides}
    return await client.post("/api/v1/season-stats", json=body, headers=headers)


async def test_sport_metrics_catalog_readable_by_anyone_authenticated(client):
    org = await build_org(client, sport="football")
    resp = await client.get(
        "/api/v1/season-stats/sports/football/metrics", headers=org["athlete1"]["headers"]
    )
    assert resp.status_code == 200
    keys = {m["key"] for m in resp.json()}
    assert {"shots", "shots_on_target", "passes", "tackles", "duels_won"} <= keys


async def test_coach_creates_entry_for_own_team_athlete(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["sport"] == "football"
    assert body["score_per_90"] == 0.9  # 9 голов / 900 минут * 90
    metrics_by_key = {m["key"]: m for m in body["metrics"]}
    assert metrics_by_key["shots"]["per_90"] == 2.0  # 20/900*90
    assert metrics_by_key["shots_on_target"]["pct"] == 0.5  # 10/20


async def test_medic_cannot_write_but_can_read(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["medic"]["headers"], a1_id)
    assert resp.status_code == 403

    await _create(client, org["coach"]["headers"], a1_id)
    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=org["medic"]["headers"])
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_player_cannot_write_but_reads_own_not_teammates(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    a2_id = org["athlete2"]["user_id"]

    resp = await _create(client, org["athlete1"]["headers"], a1_id)
    assert resp.status_code == 403

    await _create(client, org["coach"]["headers"], a1_id)
    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=org["athlete1"]["headers"])
    assert resp.status_code == 200

    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=org["athlete2"]["headers"])
    assert resp.status_code == 403
    resp = await client.get(f"/api/v1/season-stats/athletes/{a2_id}", headers=org["outsider"]["headers"])
    assert resp.status_code == 403


async def test_coach_of_other_team_cannot_write(client):
    org1 = await build_org(client, sport="football")
    org2 = await build_org(client, sport="football", suffix="2")
    a1_id = org1["athlete1"]["user_id"]

    resp = await _create(client, org2["coach"]["headers"], a1_id)
    assert resp.status_code == 403


async def test_unknown_metric_key_rejected(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id, values={"not_a_real_metric": 0.5})
    assert resp.status_code == 422


async def test_minutes_zero_per90_is_null(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id, minutes=0)
    assert resp.status_code == 201
    body = resp.json()
    assert body["score_per_90"] is None
    assert body["assists_per_90"] is None
    assert all(m["per_90"] is None for m in body["metrics"])


async def test_pct_null_without_denominator_value(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    # shots_on_target задан, а его знаменатель (shots) — нет
    resp = await _create(client, org["coach"]["headers"], a1_id, values={"shots_on_target": 5})
    assert resp.status_code == 201
    metrics_by_key = {m["key"]: m for m in resp.json()["metrics"]}
    assert metrics_by_key["shots_on_target"]["pct"] is None


async def test_update_replaces_values_without_integrity_error(client):
    """Регрессия: entry.values = [...] через delete-orphan не гарантировал DELETE
    старых строк раньше INSERT новых — одинаковый metric_key падал в unique-
    констрейнт (season_stat_id, metric_key), сервис падал 500 на PATCH."""
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id, values={"shots": 10})
    stat_id = resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/season-stats/{stat_id}",
        json={"values": {"shots": 25, "passes": 100}},
        headers=org["coach"]["headers"],
    )
    assert resp.status_code == 200, resp.text
    metrics_by_key = {m["key"]: m for m in resp.json()["metrics"]}
    assert set(metrics_by_key) == {"shots", "passes"}
    assert metrics_by_key["shots"]["value"] == 25.0


async def test_delete_removes_entry(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id)
    stat_id = resp.json()["id"]

    resp = await client.delete(f"/api/v1/season-stats/{stat_id}", headers=org["coach"]["headers"])
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=org["coach"]["headers"])
    assert resp.json() == []


async def test_team_without_sport_rejected(client):
    org = await build_org(client)  # sport не задан — дефолтное поведение build_org
    a1_id = org["athlete1"]["user_id"]

    resp = await _create(client, org["coach"]["headers"], a1_id)
    assert resp.status_code == 422
