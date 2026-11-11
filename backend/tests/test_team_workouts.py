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
        # В будущем (иначе нет уведомлений), но в окне раннего старта выполнения
        "planned_start": (datetime.now(UTC) + timedelta(minutes=10)).isoformat(),
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
            "planned_start": datetime.now(UTC).isoformat(),
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


async def _notifications(client, who) -> list[tuple[str, str | None]]:
    items = (await client.get(f"{API}/notifications", headers=who["headers"])).json()["items"]
    return [(n["type"], (n.get("event") or {}).get("id")) for n in items]


async def test_selected_athletes_only_see_event(client, team):
    """«Кому» = участники: событие для выбранных игроков остальным не видно
    ни в календаре, ни в уведомлениях, оценить его они не могут."""
    org, template = team
    a1, a2 = org["athlete1"], org["athlete2"]
    event = await _team_event(client, org, template["id"], [a1["user_id"]])
    team_url = f"{API}/events/teams/{org['team_id']}"

    def ids(resp):
        return [e["id"] for e in resp.json()]

    assert event["id"] in ids(await client.get(f"{API}/events/me", headers=a1["headers"]))
    assert event["id"] in ids(await client.get(team_url, headers=a1["headers"]))
    assert event["id"] not in ids(await client.get(f"{API}/events/me", headers=a2["headers"]))
    assert event["id"] not in ids(await client.get(team_url, headers=a2["headers"]))
    for who in (org["coach"], org["medic"], org["admin"]):
        assert event["id"] in ids(await client.get(team_url, headers=who["headers"]))
    assert event["id"] in ids(await client.get(f"{API}/events/me", headers=org["medic"]["headers"]))

    assert ("event_created", event["id"]) in await _notifications(client, a1)
    assert not [n for n in await _notifications(client, a2) if n[0] == "event_created"]

    rpe = {
        "event_id": event["id"],
        "date": event["planned_start"][:10],
        "exertion": 5,
        "performance": 5,
        "duration_min": 60,
    }
    assert (await client.post(f"{API}/rpe", json=rpe, headers=a2["headers"])).status_code == 404

    resp = await client.put(
        f"{API}/events/{event['id']}/attendance",
        json={"user_id": a2["user_id"], "status": "present"},
        headers=org["coach"]["headers"],
    )
    assert resp.status_code == 422

    # Переназначили на второго: первому «отменено», второму «новое событие»
    resp = await client.patch(
        f"{API}/events/{event['id']}",
        json={"workout_athlete_ids": [a2["user_id"]]},
        headers=org["coach"]["headers"],
    )
    assert resp.status_code == 200
    assert ("event_cancelled", None) in await _notifications(client, a1)
    assert ("event_created", event["id"]) in await _notifications(client, a2)
    assert event["id"] not in ids(await client.get(f"{API}/events/me", headers=a1["headers"]))


async def test_copy_belongs_to_whoever_places_it(client, team):
    """Список командного события, поставленный на личное событие, копируется
    в личный список того, кто ставит; автор источника его не видит."""
    org, template = team
    event = await _team_event(client, org, template["id"])
    admin = org["admin"]
    resp = await client.post(
        f"{API}/events",
        json={
            "type": "individual",
            "planned_start": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
            "planned_duration_min": 30,
            "workout_id": event["workout_id"],
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 201, resp.text
    copy_id = resp.json()["workout_id"]
    assert copy_id != event["workout_id"]
    url = f"{API}/workouts/{copy_id}"
    assert (await client.get(url, headers=admin["headers"])).status_code == 200
    for who in (org["coach"], org["athlete1"]):
        assert (await client.get(url, headers=who["headers"])).status_code == 404


async def test_removed_coach_loses_team_plan(client, team, exercises):  # noqa: F811
    org, template = team
    event = await _team_event(client, org, template["id"])
    url = f"{API}/workouts/{event['workout_id']}"
    coach = org["coach"]
    resp = await client.delete(
        f"{API}/teams/{org['team_id']}/members/{coach['user_id']}", headers=org["admin"]["headers"]
    )
    assert resp.status_code == 204
    assert (await client.get(url, headers=coach["headers"])).status_code == 404
    body = _workout_body(exercises)
    assert (await client.put(url, json=body, headers=coach["headers"])).status_code == 404
    # Админ своей организации читает и правит
    assert (await client.get(url, headers=org["admin"]["headers"])).status_code == 200
    assert (await client.put(url, json=body, headers=org["admin"]["headers"])).status_code == 200
    resp = await client.get(f"{API}/events/{event['id']}/workout-results", headers=org["admin"]["headers"])
    assert resp.status_code == 200


async def test_plan_on_event_is_removed_only_via_event(client, team):
    org, template = team
    event = await _team_event(client, org, template["id"])
    resp = await client.delete(f"{API}/workouts/{event['workout_id']}", headers=org["coach"]["headers"])
    assert resp.status_code == 409


async def test_coach_account_deletion_keeps_team_plan(client, team):
    """Тренер удалил аккаунт: командное событие и его упражнения остаются игрокам."""
    org, template = team
    a1 = org["athlete1"]
    event = await _team_event(client, org, template["id"], [a1["user_id"]])
    assert (await client.delete(f"{API}/account", headers=org["coach"]["headers"])).status_code == 204

    mine = (await client.get(f"{API}/events/me", headers=a1["headers"])).json()
    row = next(e for e in mine if e["id"] == event["id"])
    assert row["workout_id"] == event["workout_id"] and row["workout_athlete_ids"] == [a1["user_id"]]
    assert (
        await client.get(f"{API}/workouts/{event['workout_id']}", headers=a1["headers"])
    ).status_code == 200
    assert (await _start(client, a1, event["id"])).status_code == 201


async def test_assign_only_own_team_athletes(client, team):
    org, template = team
    other = await build_org(client, suffix="4")
    for bad in (other["athlete1"]["user_id"], org["coach"]["user_id"], org["outsider"]["user_id"]):
        resp = await client.post(
            f"{API}/events",
            json={
                "team_id": org["team_id"],
                "type": "training",
                "planned_start": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
                "planned_duration_min": 60,
                "workout_id": template["id"],
                "workout_athlete_ids": [bad],
            },
            headers=org["coach"]["headers"],
        )
        assert resp.status_code == 422


async def test_athlete_who_left_team_loses_plan(client, team):
    org, template = team
    a1 = org["athlete1"]
    event = await _team_event(client, org, template["id"])
    resp = await client.delete(
        f"{API}/teams/{org['team_id']}/members/{a1['user_id']}", headers=org["admin"]["headers"]
    )
    assert resp.status_code == 204
    assert (
        await client.get(f"{API}/workouts/{event['workout_id']}", headers=a1["headers"])
    ).status_code == 404
    assert (await _start(client, a1, event["id"])).status_code == 404
    # «Всем» в результатах: только игроки, без штаба
    results = (
        await client.get(f"{API}/events/{event['id']}/workout-results", headers=org["coach"]["headers"])
    ).json()
    assert [r["athlete_id"] for r in results] == [org["athlete2"]["user_id"]]
