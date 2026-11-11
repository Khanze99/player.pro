"""Упражнения на командной тренировке (этап 2 docs/plan-workout-builder.md):
права на список, выполнение и результаты. Основной сценарий (назначение одному
игроку от начала до результатов) в test_workouts.py; здесь границы доступа.

Чужое везде 404: не раскрываем, что id существует.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from tests.conftest import register_user
from tests.test_authz import build_org
from tests.test_workouts import _create_workout, _workout_body, exercises  # noqa: F401 (фикстура)

API = "/api/v1"


@pytest.fixture(autouse=True)
def _workouts_on(monkeypatch):
    monkeypatch.setattr(settings, "feature_workouts_enabled", True)


async def _team_event(client, org, workout_id, athlete_ids=None) -> dict:
    body = {
        "team_id": org["team_id"],
        "type": "training",
        "planned_start": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
        "planned_duration_min": 60,
        "workout_id": workout_id,
    }
    if athlete_ids is not None:
        body["workout_athlete_ids"] = athlete_ids
    resp = await client.post(f"{API}/events", json=body, headers=org["coach"]["headers"])
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _start(client, who, event_id):
    return await client.post(f"{API}/workout-sessions", json={"event_id": event_id}, headers=who["headers"])


@pytest.fixture
async def team(client, exercises):  # noqa: F811
    org = await build_org(client)
    template = await _create_workout(client, org["coach"]["headers"], exercises)
    return org, template


async def test_other_team_sees_nothing(client, team):
    org, template = team
    event = await _team_event(client, org, template["id"])
    a1 = org["athlete1"]
    session = (await _start(client, a1, event["id"])).json()

    other = await build_org(client, suffix="2")
    for who in (other["coach"], other["medic"], other["athlete1"], other["admin"]):
        h = who["headers"]
        assert (await client.get(f"{API}/workouts/{event['workout_id']}", headers=h)).status_code == 404
        assert (await client.get(f"{API}/workout-sessions/{session['id']}", headers=h)).status_code == 404
        resp = await client.get(f"{API}/events/{event['id']}/workout-results", headers=h)
        assert resp.status_code == 404
        assert (await _start(client, who, event["id"])).status_code == 404
        resp = await client.put(f"{API}/workouts/{event['workout_id']}", json={}, headers=h)
        assert resp.status_code in (404, 422)  # 422 раньше прав: пустое тело не проходит схему


async def test_other_team_put_plan_is_404(client, team, exercises):  # noqa: F811
    org, template = team
    event = await _team_event(client, org, template["id"])
    other = await build_org(client, suffix="3")
    resp = await client.put(
        f"{API}/workouts/{event['workout_id']}",
        json=_workout_body(exercises),
        headers=other["coach"]["headers"],
    )
    assert resp.status_code == 404


async def test_staff_never_sees_personal_workouts(client, team, exercises):  # noqa: F811
    """Личные тренировки игрока остаются строго личными и у игрока команды."""
    org, _ = team
    a1 = org["athlete1"]
    h = a1["headers"]
    own_template = await _create_workout(client, h, exercises, "Моё")
    resp = await client.post(
        f"{API}/events",
        json={
            "type": "individual",
            "planned_start": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            "planned_duration_min": 30,
            "workout_id": own_template["id"],
        },
        headers=h,
    )
    personal = resp.json()
    session = (await _start(client, a1, personal["id"])).json()

    for who in (org["coach"], org["medic"], org["admin"], org["athlete2"]):
        sh = who["headers"]
        for workout_id in (own_template["id"], personal["workout_id"]):
            assert (await client.get(f"{API}/workouts/{workout_id}", headers=sh)).status_code == 404
        assert (await client.get(f"{API}/workout-sessions/{session['id']}", headers=sh)).status_code == 404
        resp = await client.get(f"{API}/events/{personal['id']}/workout-results", headers=sh)
        assert resp.status_code == 404


async def test_coaches_edit_plan_medic_and_athletes_only_read(client, team, exercises):  # noqa: F811
    org, template = team
    resp = await client.post(
        f"{API}/organizations/invites",
        json={
            "identifier": "head@org.com",
            "global_role": "staff",
            "team_id": org["team_id"],
            "team_role": "head_coach",
        },
        headers=org["admin"]["headers"],
    )
    assert resp.status_code == 201, resp.text
    head = await register_user(client, "head@org.com", device_id="device-head-0001")

    event = await _team_event(client, org, template["id"])
    url = f"{API}/workouts/{event['workout_id']}"
    body = _workout_body(exercises, "Правка главного тренера")
    assert (await client.put(url, json=body, headers=head["headers"])).status_code == 200
    assert (await client.get(url, headers=org["athlete1"]["headers"])).json()[
        "name"
    ] == "Правка главного тренера"
    for who in (org["medic"], org["athlete1"]):
        assert (await client.put(url, json=body, headers=who["headers"])).status_code == 404
    # Врач событие не правит, значит и назначения тоже
    resp = await client.patch(
        f"{API}/events/{event['id']}",
        json={"workout_athlete_ids": [org["athlete1"]["user_id"]]},
        headers=org["medic"]["headers"],
    )
    assert resp.status_code == 403
    # Главный тренер может поставить на событие свой шаблон
    head_template = await _create_workout(client, head["headers"], exercises, "Шаблон главного")
    resp = await client.patch(
        f"{API}/events/{event['id']}", json={"workout_id": head_template["id"]}, headers=head["headers"]
    )
    assert resp.status_code == 200 and resp.json()["workout_name"] == "Шаблон главного"
    # Прежний список снят и удалён
    assert (await client.get(url, headers=org["coach"]["headers"])).status_code == 404


async def test_each_athlete_has_own_session(client, team):
    org, template = team
    event = await _team_event(client, org, template["id"])
    a1, a2 = org["athlete1"], org["athlete2"]

    first = (await _start(client, a1, event["id"])).json()
    second = await _start(client, a2, event["id"])
    assert second.status_code == 201 and second.json()["id"] != first["id"]

    await client.post(f"{API}/workout-sessions/{first['id']}/finish", headers=a1["headers"])
    again = await _start(client, a1, event["id"])
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "event_has_session"
    assert again.json()["detail"]["session_id"] == first["id"]

    # Каждый видит только своё по событию
    rows = (
        await client.get(f"{API}/workout-sessions/me?event_id={event['id']}", headers=a2["headers"])
    ).json()
    assert [r["id"] for r in rows] == [second.json()["id"]]


async def test_unassigned_athlete_keeps_own_result(client, team):
    """Сняли с назначения после старта: доступ к списку и новому старту пропал,
    своё выполнение осталось, и штаб видит его в результатах."""
    org, template = team
    a1, a2 = org["athlete1"], org["athlete2"]
    event = await _team_event(client, org, template["id"], [a1["user_id"], a2["user_id"]])
    session = (await _start(client, a2, event["id"])).json()

    resp = await client.patch(
        f"{API}/events/{event['id']}",
        json={"workout_athlete_ids": [a1["user_id"]]},
        headers=org["coach"]["headers"],
    )
    assert resp.json()["workout_athlete_ids"] == [a1["user_id"]]
    assert (
        await client.get(f"{API}/workouts/{event['workout_id']}", headers=a2["headers"])
    ).status_code == 404
    url = f"{API}/workout-sessions/{session['id']}"
    assert (await client.get(url, headers=a2["headers"])).status_code == 200

    results = (
        await client.get(f"{API}/events/{event['id']}/workout-results", headers=org["coach"]["headers"])
    ).json()
    assert {r["athlete_id"]: r["status"] for r in results} == {
        a1["user_id"]: "not_started",
        a2["user_id"]: "in_progress",
    }
    in_progress = next(r for r in results if r["athlete_id"] == a2["user_id"])
    assert in_progress["session_id"] == session["id"] and in_progress["sets_done"] == 0


async def test_assignments_follow_the_plan(client, team):
    org, template = team
    a1 = org["athlete1"]
    coach_h = org["coach"]["headers"]
    event = await _team_event(client, org, template["id"], [a1["user_id"]])
    url = f"{API}/events/{event['id']}"

    # Правка без поля назначения его не трогает
    resp = await client.patch(url, json={"title": "Сила"}, headers=coach_h)
    assert resp.json()["workout_athlete_ids"] == [a1["user_id"]]
    # Игрок видит назначение в своём календаре
    mine = (await client.get(f"{API}/events/me", headers=a1["headers"])).json()
    assert next(e for e in mine if e["id"] == event["id"])["workout_athlete_ids"] == [a1["user_id"]]

    # Сняли упражнения: назначения очищены, без упражнений назначить нельзя
    resp = await client.patch(url, json={"workout_id": None}, headers=coach_h)
    assert resp.json()["workout_id"] is None and resp.json()["workout_athlete_ids"] == []
    resp = await client.patch(url, json={"workout_athlete_ids": [a1["user_id"]]}, headers=coach_h)
    assert resp.status_code == 422

    # Дубли в списке схлопываются
    event2 = await _team_event(client, org, template["id"], [a1["user_id"], a1["user_id"]])
    assert event2["workout_athlete_ids"] == [a1["user_id"]]


async def test_results_need_flag(client, team, monkeypatch):
    org, template = team
    event = await _team_event(client, org, template["id"])
    monkeypatch.setattr(settings, "feature_workouts_enabled", False)
    resp = await client.get(f"{API}/events/{event['id']}/workout-results", headers=org["coach"]["headers"])
    assert resp.status_code == 404
