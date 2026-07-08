"""Аналитика: EWMA/ACWR/Readiness через API + идемпотентность пересчёта."""

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.core import calculations as calc
from app.models.enums import UserStatus
from app.models.metric import DailyMetric
from app.models.rpe import RpeEntry
from app.models.user import User
from app.services import analytics_service
from tests.conftest import register_user


async def _create_athlete(db) -> uuid.UUID:
    user = User(email=f"{uuid.uuid4().hex[:12]}@test.com", status=UserStatus.active)
    db.add(user)
    await db.commit()
    return user.id


async def test_rpe_creates_session_load_and_metric(client):
    user = await register_user(client, "rpe@example.com")
    resp = await client.post(
        "/api/v1/rpe",
        json={"date": str(date.today()), "exertion": 6, "performance": 4, "duration_min": 90},
        headers=user["headers"],
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["entry"]["session_load"] == 540
    assert body["streak"] == 1

    metrics = await client.get("/api/v1/analytics/me/metrics", headers=user["headers"])
    assert metrics.status_code == 200
    today_metric = metrics.json()[-1]
    assert today_metric["daily_load"] == 540
    assert today_metric["ewma_acute"] == 540  # первый день: EWMA = load


async def test_wellness_returns_readiness(client):
    user = await register_user(client, "well@example.com")
    resp = await client.post(
        "/api/v1/wellness",
        json={
            "date": str(date.today()),
            "mood": 10,
            "energy": 10,
            "sleep_quality": 10,
            "stress": 1,
            "soreness": 1,
        },
        headers=user["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["readiness"] == 100
    assert resp.json()["readiness_zone"] == "green"
    assert resp.json()["streak"] == 1


async def test_wellness_pain_points_and_structured_fields_dont_affect_score(client):
    """Карта боли и структурные injury/symptom сохраняются, но на Readiness не влияют."""
    date_str = str(date.today())
    base = {
        "date": date_str,
        "mood": 6,
        "energy": 6,
        "sleep_quality": 6,
        "stress": 4,
        "soreness": 5,
    }

    detailed = {
        **base,
        "injury": True,
        "injury_area": "hamstring",
        "injury_type": "muscle",
        "symptom": True,
        "symptom_type": "headache",
        "comment": "tight left hamstring",
        "pain_points": [
            {"region": "hamstring", "side": "left", "severity": 7},
            {"region": "knee", "side": "right", "severity": 3},
        ],
    }
    u1 = await register_user(client, "pain@example.com")
    r1 = await client.post("/api/v1/wellness", json=detailed, headers=u1["headers"])
    assert r1.status_code == 201
    entry = r1.json()["entry"]
    assert entry["injury_area"] == "hamstring"
    assert entry["injury_type"] == "muscle"
    assert entry["symptom_type"] == "headache"
    assert entry["comment"] == "tight left hamstring"
    assert len(entry["pain_points"]) == 2
    assert {p["region"] for p in entry["pain_points"]} == {"hamstring", "knee"}
    left = next(p for p in entry["pain_points"] if p["region"] == "hamstring")
    assert left["side"] == "left" and left["severity"] == 7

    # Другой атлет, те же 5 шкал, но без карты боли/травмы → тот же Readiness
    u2 = await register_user(client, "pain2@example.com")
    r2 = await client.post("/api/v1/wellness", json=base, headers=u2["headers"])
    assert r2.status_code == 201
    assert r2.json()["readiness"] == r1.json()["readiness"]

    # История отдаёт карту боли
    hist = await client.get("/api/v1/wellness/me", headers=u1["headers"])
    assert hist.status_code == 200
    assert len(hist.json()[0]["pain_points"]) == 2


async def test_recalc_ewma_chain_and_rest_days(db):
    """День отдыха = 0 AU, а не пропуск: EWMA продолжает затухать."""
    athlete_id = await _create_athlete(db)
    start = date.today() - timedelta(days=4)
    # Нагрузка только в первый день; дальше 4 дня отдыха
    db.add(
        RpeEntry(
            athlete_id=athlete_id, date=start, exertion=8, performance=3, duration_min=100, session_load=800
        )
    )
    await db.commit()

    days = await analytics_service.recalc_athlete(db, athlete_id)
    assert days == 5

    rows = await db.execute(
        select(DailyMetric).where(DailyMetric.athlete_id == athlete_id).order_by(DailyMetric.date)
    )
    metrics = list(rows.scalars())
    assert metrics[0].ewma_acute == 800
    expected = calc.ewma_next(0, 800.0, calc.LAMBDA_ACUTE)
    assert metrics[1].ewma_acute == pytest.approx(expected)
    assert metrics[1].daily_load == 0
    # Острая затухает быстрее хронической → ACWR < 1 при отдыхе
    assert metrics[-1].acwr is not None and metrics[-1].acwr < 1


async def test_recalc_idempotent_no_duplicates(db):
    athlete_id = await _create_athlete(db)
    db.add(
        RpeEntry(
            athlete_id=athlete_id,
            date=date.today(),
            exertion=5,
            performance=3,
            duration_min=60,
            session_load=300,
        )
    )
    await db.commit()

    await analytics_service.recalc_athlete(db, athlete_id)
    await analytics_service.recalc_athlete(db, athlete_id)

    count = (
        await db.execute(
            select(func.count()).select_from(DailyMetric).where(DailyMetric.athlete_id == athlete_id)
        )
    ).scalar()
    assert count == 1
