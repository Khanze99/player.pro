"""Восстановительные процедуры вчера — docs/plan-recovery-methods.md.

Деталь для medic/coach, на Readiness не влияет, хранится отдельной таблицей
(recovery_method_logs), как и карта боли (pain_points) и симптомы цикла.
"""

from datetime import date

from tests.test_authz import WELLNESS, build_org


async def test_recovery_methods_roundtrip_and_dedup(client):
    """Дубли с клиента схлопываются в уникальный набор, лишние поля не теряются."""
    org = await build_org(client)
    payload = {**WELLNESS, "recovery_methods": ["massage", "cryo_compression", "massage"]}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    saved = sorted(resp.json()["entry"]["recovery_methods"])
    assert saved == ["cryo_compression", "massage"]

    a1_id = org["athlete1"]["user_id"]
    resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["athlete1"]["headers"])
    assert resp.status_code == 200
    assert sorted(resp.json()[0]["recovery_methods"]) == ["cryo_compression", "massage"]


async def test_recovery_methods_default_empty(client):
    """Старый клиент без поля (и день без процедур) — пустой список, не 422."""
    org = await build_org(client)
    resp = await client.post("/api/v1/wellness", json=WELLNESS, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["entry"]["recovery_methods"] == []


async def test_recovery_methods_rejects_unknown_value(client):
    """Список закрытый: значение вне RecoveryMethod — 422, не тихо отброшено."""
    org = await build_org(client)
    payload = {**WELLNESS, "recovery_methods": ["sauna"]}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 422


async def test_recovery_methods_visible_to_coach_and_medic(client):
    """Тот же эндпоинт и то же правило доступа, что у pain_points — coach и medic
    видят процедуры игрока своей команды одинаково (ensure_can_view_athlete)."""
    org = await build_org(client)
    payload = {**WELLNESS, "date": str(date.today()), "recovery_methods": ["compression", "physio"]}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text

    a1_id = org["athlete1"]["user_id"]
    for who in ("coach", "medic"):
        resp = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org[who]["headers"])
        assert resp.status_code == 200, f"{who}: {resp.text}"
        assert sorted(resp.json()[0]["recovery_methods"]) == ["compression", "physio"]
