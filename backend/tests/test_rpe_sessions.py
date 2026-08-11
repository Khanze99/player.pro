"""RPE привязан к сессии расписания: только после её окончания и по одной оценке на сессию."""

from datetime import UTC, datetime, timedelta

from tests.conftest import register_user


async def _create_event(client, headers, start: datetime, duration_min: int = 60, title="Утренняя"):
    resp = await client.post(
        "/api/v1/events",
        json={
            "type": "training",
            "title": title,
            "planned_start": start.isoformat(),
            "planned_duration_min": duration_min,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _rpe_payload(day, event_id: str | None = None) -> dict:
    return {
        "date": str(day),
        "exertion": 7,
        "performance": 5,
        "duration_min": 60,
        "event_id": event_id,
    }


async def test_sessions_report_finished_and_rated(client):
    user = await register_user(client, "sessions@example.com")
    now = datetime.now(UTC)
    past = await _create_event(client, user["headers"], now - timedelta(hours=3), title="Утренняя")
    future = await _create_event(client, user["headers"], now + timedelta(hours=3), title="Вечерняя")

    # Дни берём у каждого события свои: прогон около полуночи UTC иначе разносит их по суткам
    day = (now - timedelta(hours=3)).date()
    future_day = (now + timedelta(hours=3)).date()

    resp = await client.get(f"/api/v1/rpe/sessions?day={day}", headers=user["headers"])
    assert resp.status_code == 200, resp.text
    by_id = {s["event_id"]: s for s in resp.json()}
    assert by_id[past["id"]]["finished"] is True
    assert by_id[past["id"]]["rpe_submitted"] is False

    resp = await client.get(f"/api/v1/rpe/sessions?day={future_day}", headers=user["headers"])
    future_row = next(s for s in resp.json() if s["event_id"] == future["id"])
    assert future_row["finished"] is False

    created = await client.post("/api/v1/rpe", json=_rpe_payload(day, past["id"]), headers=user["headers"])
    assert created.status_code == 201, created.text
    assert created.json()["entry"]["event_id"] == past["id"]

    resp = await client.get(f"/api/v1/rpe/sessions?day={day}", headers=user["headers"])
    assert next(s for s in resp.json() if s["event_id"] == past["id"])["rpe_submitted"] is True


async def test_sessions_day_follows_client_timezone(client):
    """День — локальный для игрока: вечерняя тренировка не уезжает в соседние сутки."""
    user = await register_user(client, "tz@example.com")
    # 22:00 UTC 10 августа = 01:00 MSK уже 11-го
    start = datetime(2026, 8, 10, 22, 0, tzinfo=UTC)
    event = await _create_event(client, user["headers"], start, title="Поздняя")

    msk = 180
    for day, expected in (("2026-08-10", False), ("2026-08-11", True)):
        resp = await client.get(
            f"/api/v1/rpe/sessions?day={day}&tz_offset_min={msk}", headers=user["headers"]
        )
        assert resp.status_code == 200, resp.text
        found = any(s["event_id"] == event["id"] for s in resp.json())
        assert found is expected, f"{day}: ожидали {expected}"

    # Без смещения (UTC) та же тренировка принадлежит 10 августа
    resp = await client.get("/api/v1/rpe/sessions?day=2026-08-10", headers=user["headers"])
    assert [s["event_id"] for s in resp.json()] == [event["id"]]


async def test_cannot_rate_session_before_it_ends(client):
    user = await register_user(client, "early@example.com")
    now = datetime.now(UTC)
    # Тренировка идёт прямо сейчас: закончится через полчаса
    ongoing = await _create_event(client, user["headers"], now - timedelta(minutes=30), duration_min=60)

    resp = await client.post(
        "/api/v1/rpe", json=_rpe_payload(now.date(), ongoing["id"]), headers=user["headers"]
    )
    assert resp.status_code == 422, resp.text
    assert "окончания" in resp.json()["detail"]


async def test_one_rpe_per_session(client):
    user = await register_user(client, "once@example.com")
    now = datetime.now(UTC)
    event = await _create_event(client, user["headers"], now - timedelta(hours=2))

    first = await client.post(
        "/api/v1/rpe", json=_rpe_payload(now.date(), event["id"]), headers=user["headers"]
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        "/api/v1/rpe", json=_rpe_payload(now.date(), event["id"]), headers=user["headers"]
    )
    assert second.status_code == 409, second.text


async def test_two_sessions_a_day_are_rated_separately(client):
    user = await register_user(client, "double@example.com")
    now = datetime.now(UTC)
    morning = await _create_event(client, user["headers"], now - timedelta(hours=6), title="Утренняя")
    gym = await _create_event(client, user["headers"], now - timedelta(hours=2), title="Зал")

    for event in (morning, gym):
        resp = await client.post(
            "/api/v1/rpe", json=_rpe_payload(now.date(), event["id"]), headers=user["headers"]
        )
        assert resp.status_code == 201, resp.text

    history = await client.get("/api/v1/rpe/me", headers=user["headers"])
    assert {e["event_id"] for e in history.json()} == {morning["id"], gym["id"]}


async def test_cannot_rate_someone_elses_session(client):
    owner = await register_user(client, "owner@example.com")
    other = await register_user(client, "other@example.com", device_id="dev-other-001")
    event = await _create_event(client, owner["headers"], datetime.now(UTC) - timedelta(hours=2))

    resp = await client.post(
        "/api/v1/rpe",
        json=_rpe_payload(datetime.now(UTC).date(), event["id"]),
        headers=other["headers"],
    )
    assert resp.status_code == 404, resp.text


async def test_free_rpe_without_events_still_allowed(client):
    """Личный режим: расписания нет — оценка нагрузки сохраняется без привязки."""
    user = await register_user(client, "free@example.com")
    day = datetime.now(UTC).date()

    sessions = await client.get(f"/api/v1/rpe/sessions?day={day}", headers=user["headers"])
    assert sessions.json() == []

    resp = await client.post("/api/v1/rpe", json=_rpe_payload(day), headers=user["headers"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["entry"]["event_id"] is None
