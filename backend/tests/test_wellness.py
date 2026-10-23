"""Восстановительные процедуры вчера — docs/plan-recovery-methods.md.

Деталь для medic/coach, на Readiness не влияет, хранится отдельной таблицей
(recovery_method_logs), как и карта боли (pain_points) и симптомы цикла.
"""

from datetime import date, timedelta

from app.models.enums import ConsentAudience, ConsentScope
from app.services import consent_service
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


# ------------------------------------------------------- вес — docs/plan-weight-tracking.md


async def test_weight_syncs_to_profile(client):
    """Отправленный в опросе вес становится «последним известным» в профиле."""
    org = await build_org(client)
    payload = {**WELLNESS, "weight_kg": 78.4}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    assert float(resp.json()["entry"]["weight_kg"]) == 78.4

    profile = await client.get("/api/v1/users/me/profile", headers=org["athlete1"]["headers"])
    assert float(profile.json()["weight_kg"]) == 78.4
    assert profile.json()["bmi"] is None  # рост не заполнен


async def test_weight_backfill_does_not_overwrite_newer_value(client):
    """Задним числом заполненный старый день не должен перетирать уже известный
    более свежий вес (docs/plan-weight-tracking.md: синхронизация только по
    самой свежей дате с весом)."""
    org = await build_org(client)
    today = date.today()
    yesterday = today - timedelta(days=1)

    resp = await client.post(
        "/api/v1/wellness",
        json={**WELLNESS, "date": str(today), "weight_kg": 80.0},
        headers=org["athlete1"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = await client.post(
        "/api/v1/wellness",
        json={**WELLNESS, "date": str(yesterday), "weight_kg": 90.0},
        headers=org["athlete1"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    profile = await client.get("/api/v1/users/me/profile", headers=org["athlete1"]["headers"])
    assert float(profile.json()["weight_kg"]) == 80.0  # не перетёрлось старым днём


async def test_weight_gated_by_body_metrics_consent(client, db):
    """weight_kg в /wellness/athletes/{id} — спецкатегория body_metrics: нулится
    без согласия, видно с ним, себе — всегда (ensure_can_view_sensitive)."""
    org = await build_org(client)
    payload = {**WELLNESS, "weight_kg": 78.4}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    a1_id = org["athlete1"]["user_id"]

    self_view = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["athlete1"]["headers"])
    assert float(self_view.json()[0]["weight_kg"]) == 78.4

    coach_before = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["coach"]["headers"])
    assert coach_before.status_code == 200
    assert coach_before.json()[0]["weight_kg"] is None  # нет согласия

    # audience=coach — старший ранг (_AUDIENCE_RANK в consent_service): открывает
    # и coach, и medic. Узкое «только врачу» — audience=medic (как в test_profile.py).
    await consent_service.grant(db, a1_id, ConsentScope.body_metrics, ConsentAudience.coach)
    coach_after = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["coach"]["headers"])
    assert float(coach_after.json()[0]["weight_kg"]) == 78.4

    medic_view = await client.get(f"/api/v1/wellness/athletes/{a1_id}", headers=org["medic"]["headers"])
    assert float(medic_view.json()[0]["weight_kg"]) == 78.4
