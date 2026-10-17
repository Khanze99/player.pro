"""Цикл в утреннем опросе — docs/plan-women-health-nutrition.md.

Главное здесь — что `period_day`/`period_pain_level` уходят из WellnessCreateIn прямо
в cycle_logs и никогда не всплывают обратно в WellnessOut: иначе согласие на цикл
(ensure_can_view_sensitive) обходилось бы через опрос, который coach/medic видят без
него (ensure_can_view_athlete).
"""

from datetime import date

from app.models.enums import ConsentAudience, ConsentScope
from app.schemas.cycle import CycleLogIn
from app.services import consent_service, cycle_service
from tests.test_authz import WELLNESS, build_org
from tests.test_cycle import _team_with_female_athlete

# ------------------------------------------------------------------ сервис


async def test_record_from_wellness_creates_log(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.record_from_wellness(db, athlete_id, today, True, 6)

    logs = await cycle_service.get_logs(db, athlete_id, today, today)
    assert len(logs) == 1
    assert logs[0].on_period is True
    assert logs[0].pain_level == 6


async def test_record_from_wellness_does_not_override_manual_entry(db):
    """Запись уже стоит вручную (экран цикла/календарь) — не трогаем on_period,
    дозаполняем только pain_level, если его там не было."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=today, on_period=False))

    await cycle_service.record_from_wellness(db, athlete_id, today, True, 7)

    logs = await cycle_service.get_logs(db, athlete_id, today, today)
    assert len(logs) == 1
    assert logs[0].on_period is False  # ручная отметка не перезаписана
    assert logs[0].pain_level == 7  # дозаполнили, было пусто


async def test_record_from_wellness_noop_without_period_flag(db):
    """on_period=None — опрос цикл-поля не прислал (не женщина/опрос без них) — нечего писать."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.record_from_wellness(db, athlete_id, today, None, 8)

    logs = await cycle_service.get_logs(db, athlete_id, today, today)
    assert logs == []


# ------------------------------------------------------------------ сквозь API


async def test_wellness_period_fields_not_leaked_in_response(client):
    org = await build_org(client)
    a1 = org["athlete1"]

    payload = {**WELLNESS, "period_day": True, "period_pain_level": 6}
    resp = await client.post("/api/v1/wellness", json=payload, headers=a1["headers"])
    assert resp.status_code == 201, resp.text
    entry = resp.json()["entry"]
    assert "period_day" not in entry
    assert "period_pain_level" not in entry

    # ...и в истории (которую видят coach/medic без какого-либо согласия на цикл) тоже
    resp = await client.get(f"/api/v1/wellness/athletes/{a1['user_id']}", headers=org["coach"]["headers"])
    assert resp.status_code == 200, resp.text
    assert "period_day" not in resp.json()[0]
    assert "period_pain_level" not in resp.json()[0]

    # а в cycle_logs данные реально легли
    resp = await client.get("/api/v1/cycle/me/logs", headers=a1["headers"])
    assert resp.status_code == 200
    assert resp.json()[0]["on_period"] is True


async def test_wellness_period_fields_do_not_bypass_cycle_consent(client, db):
    """Опрос с цикл-полями не должен открыть coach/medic доступ к cycle_*, минуя
    ensure_can_view_sensitive — согласия на это никто не давал."""
    org = await build_org(client)
    a1 = org["athlete1"]

    payload = {**WELLNESS, "period_day": True, "period_pain_level": 5}
    resp = await client.post("/api/v1/wellness", json=payload, headers=a1["headers"])
    assert resp.status_code == 201, resp.text

    for who in ("coach", "medic"):
        resp = await client.get(f"/api/v1/cycle/athletes/{a1['user_id']}/state", headers=org[who]["headers"])
        assert resp.status_code == 403, f"{who}: {resp.text}"

    # Дав согласие явно, medic получает доступ — правило authz само по себе не трогали
    await consent_service.grant(db, a1["user_id"], ConsentScope.cycle, ConsentAudience.medic)
    resp = await client.get(f"/api/v1/cycle/athletes/{a1['user_id']}/state", headers=org["medic"]["headers"])
    assert resp.status_code == 200, resp.text
