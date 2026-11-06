"""Статистика по сезонам (docs/plan-player-season-stats.md): доступ, per-90/%,
валидация каталога метрик, CRUD."""

import json

from tests.conftest import register_user
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


# ---------- каталог: миграция и копия в сервисе не должны разъехаться ----------


def _migration_catalog() -> list[dict]:
    """FOOTBALL_METRICS из data-миграции: app-код миграции не импортирует
    (исторический снимок), поэтому грузим файл по пути только в тесте."""
    import importlib.util
    from pathlib import Path

    path = Path(__file__).parents[1] / "alembic/versions/20261105_2019_season_player_stats.py"
    spec = importlib.util.spec_from_file_location("_season_stats_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.FOOTBALL_METRICS


def _normalize(metrics: list[dict]) -> dict[str, dict]:
    # radar_max в миграции строкой ("12"), в сервисе числом: сравниваем значения
    return {
        m["key"]: {**m, "radar_max": None if m["radar_max"] is None else float(m["radar_max"])}
        for m in metrics
    }


def test_football_catalog_matches_migration_seed():
    from app.services.season_stats_service import FOOTBALL_METRICS

    assert _normalize(FOOTBALL_METRICS) == _normalize(_migration_catalog())


# ---------- права: админ только своей организации ----------


async def test_org_admin_writes_own_org_but_not_other(client):
    org1 = await build_org(client, sport="football")
    org2 = await build_org(client, sport="football", suffix="2")
    a1_id = org1["athlete1"]["user_id"]

    resp = await _create(client, org1["admin"]["headers"], a1_id)
    assert resp.status_code == 201, resp.text
    stat_id = resp.json()["id"]

    resp = await _create(client, org2["admin"]["headers"], a1_id, season="2024/25")
    assert resp.status_code == 403
    resp = await client.patch(
        f"/api/v1/season-stats/{stat_id}", json={"matches": 1}, headers=org2["admin"]["headers"]
    )
    assert resp.status_code == 403
    resp = await client.delete(f"/api/v1/season-stats/{stat_id}", headers=org2["admin"]["headers"])
    assert resp.status_code == 403


# ---------- дубли записи ----------


async def test_duplicate_entry_rejected_409(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    coach = org["coach"]["headers"]

    assert (await _create(client, coach, a1_id)).status_code == 201
    resp = await _create(client, coach, a1_id)  # тот же сезон/команда, турнир не задан
    assert resp.status_code == 409, resp.text
    # "" и пробелы = «без турнира», не обход ключа
    assert (await _create(client, coach, a1_id, competition="  ")).status_code == 409

    # другой турнир того же сезона: законно, это и есть «Все турниры»
    assert (await _create(client, coach, a1_id, competition="Кубок")).status_code == 201
    assert (await _create(client, coach, a1_id, competition="Кубок")).status_code == 409

    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=coach)
    assert len(resp.json()) == 2


async def test_update_into_existing_entry_rejected_409(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    coach = org["coach"]["headers"]

    await _create(client, coach, a1_id, competition="Первенство")
    cup_id = (await _create(client, coach, a1_id, competition="Кубок")).json()["id"]

    resp = await client.patch(
        f"/api/v1/season-stats/{cup_id}", json={"competition": "Первенство"}, headers=coach
    )
    assert resp.status_code == 409, resp.text
    # после отказа сессия живая, запись не изменилась
    resp = await client.get(f"/api/v1/season-stats/athletes/{a1_id}", headers=coach)
    assert sorted(e["competition"] for e in resp.json()) == ["Кубок", "Первенство"]


# ---------- валидация ----------


async def test_season_format_validated(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    coach = org["coach"]["headers"]

    for bad in ("2025-26", "2025/27", "25/26", "сезон"):
        assert (await _create(client, coach, a1_id, season=bad)).status_code == 422, bad
    assert (await _create(client, coach, a1_id, season="1999/00")).status_code == 201

    stat_id = (await _create(client, coach, a1_id)).json()["id"]
    resp = await client.patch(f"/api/v1/season-stats/{stat_id}", json={"season": "2025-26"}, headers=coach)
    assert resp.status_code == 422


async def test_metric_values_validated(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    coach = org["coach"]["headers"]

    for bad in ({"shots": -1}, {"shots": 10_000_000}):
        assert (await _create(client, coach, a1_id, values=bad)).status_code == 422, bad

    # NaN не по стандарту JSON, но json.loads его принимает: шлём сырым телом.
    # Регрессия: эхо NaN в "input" ошибки роняло сам ответ 422 в 500 (core/errors.py)
    payload = {"athlete_id": a1_id, "season": "2025/26", "team_label": "Основа", "values": {"shots": 0}}
    body = json.dumps(payload).replace('"shots": 0', '"shots": NaN')
    resp = await client.post(
        "/api/v1/season-stats", content=body, headers={**coach, "Content-Type": "application/json"}
    )
    assert resp.status_code == 422


async def test_pct_numerator_not_above_denominator(client):
    org = await build_org(client, sport="football")
    a1_id = org["athlete1"]["user_id"]
    coach = org["coach"]["headers"]

    resp = await _create(client, coach, a1_id, values={"shots": 10, "shots_on_target": 12})
    assert resp.status_code == 422

    stat_id = (await _create(client, coach, a1_id, values={"shots": 10, "shots_on_target": 10})).json()["id"]
    resp = await client.patch(
        f"/api/v1/season-stats/{stat_id}",
        json={"values": {"passes": 50, "passes_completed": 51}},
        headers=coach,
    )
    assert resp.status_code == 422


# ---------- медиана команды (ориентир радара) ----------


async def _add_athlete(client, org, n: int):
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": f"a{n}@org.com",
            "global_role": "player",
            "team_id": org["team_id"],
            "team_role": "athlete",
        },
        headers=org["admin"]["headers"],
    )
    assert resp.status_code == 201, resp.text
    return await register_user(client, f"a{n}@org.com", device_id=f"device-a{n}-0001")


async def _benchmark(client, org, headers, season="2025/26"):
    return await client.get(
        f"/api/v1/season-stats/teams/{org['team_id']}/benchmark",
        params={"season": season},
        headers=headers,
    )


async def test_team_benchmark_median_and_minutes_threshold(client):
    org = await build_org(client, sport="football")
    a3 = await _add_athlete(client, org, 3)
    a4 = await _add_athlete(client, org, 4)
    coach = org["coach"]["headers"]

    # shots/90: 1.0, 2.0, 3.0 у трёх игроков с 900′; четвёртый с 90′ (10/90)
    # в медиану не входит: иначе 10 ударов за матч тянули бы ориентир вверх
    for athlete_id, shots in (
        (org["athlete1"]["user_id"], 10),
        (org["athlete2"]["user_id"], 20),
        (a3["user_id"], 30),
    ):
        resp = await _create(
            client, coach, athlete_id, minutes=900, values={"shots": shots, "shots_on_target": shots / 2}
        )
        assert resp.status_code == 201, resp.text
    await _create(client, coach, a4["user_id"], minutes=90, values={"shots": 10})

    resp = await _benchmark(client, org, coach)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["players"] == 3
    assert body["min_minutes"] == 450
    by_key = {m["key"]: m for m in body["metrics"]}
    assert by_key["shots"]["per_90"] == 2.0
    assert by_key["shots"]["players"] == 3
    assert by_key["shots_on_target"]["pct"] == 0.5


async def test_team_benchmark_sums_tournaments_per_player(client):
    org = await build_org(client, sport="football")
    a3 = await _add_athlete(client, org, 3)
    coach = org["coach"]["headers"]
    a1 = org["athlete1"]["user_id"]

    # 300′ + 300′ в двух турнирах = 600′: проходит порог только суммой
    await _create(client, coach, a1, minutes=300, competition="Лига", values={"shots": 10})
    await _create(client, coach, a1, minutes=300, competition="Кубок", values={"shots": 10})
    for athlete_id in (org["athlete2"]["user_id"], a3["user_id"]):
        await _create(client, coach, athlete_id, minutes=600, values={"shots": 20})

    body = (await _benchmark(client, org, coach)).json()
    assert body["players"] == 3
    assert {m["key"]: m for m in body["metrics"]}["shots"]["per_90"] == 3.0


async def test_team_benchmark_hidden_below_three_players(client):
    org = await build_org(client, sport="football")
    coach = org["coach"]["headers"]
    for athlete in ("athlete1", "athlete2"):
        await _create(client, coach, org[athlete]["user_id"], minutes=900, values={"shots": 10})

    body = (await _benchmark(client, org, coach)).json()
    assert body["players"] == 2
    assert body["metrics"] == []
    assert body["score_per_90"] is None


async def test_team_benchmark_access(client):
    org = await build_org(client, sport="football")
    other = await build_org(client, sport="football", suffix="2")

    for key in ("coach", "medic", "admin"):
        assert (await _benchmark(client, org, org[key]["headers"])).status_code == 200, key
    for headers in (org["athlete1"]["headers"], other["coach"]["headers"], other["admin"]["headers"]):
        assert (await _benchmark(client, org, headers)).status_code == 403
    assert (await _benchmark(client, org, org["coach"]["headers"], season="2025-26")).status_code == 422
