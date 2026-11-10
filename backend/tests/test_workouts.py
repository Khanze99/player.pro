"""Конструктор тренировок (docs/plan-workout-builder.md): шаблоны, привязка к
событию, выполнение, «прошлый раз». Флаг FEATURE_WORKOUTS_ENABLED включается
фикстурой, отдельный тест проверяет, что без него фичи нет.
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.config import settings
from app.models.enums import ExerciseBodyPart, ExerciseSource
from app.models.exercise import Exercise
from tests.conftest import register_user

API = "/api/v1"


@pytest.fixture(autouse=True)
def _workouts_on(monkeypatch):
    monkeypatch.setattr(settings, "feature_workouts_enabled", True)


def _exercise(
    external_id: str, name_ru: str, name_en: str, body_part=ExerciseBodyPart.chest, **extra
) -> Exercise:
    return Exercise(
        source=ExerciseSource.exercises_dataset,
        external_id=external_id,
        name_en=name_en,
        name_ru=name_ru,
        name_es=name_en,
        body_part=body_part,
        equipment=extra.pop("equipment", "barbell"),
        target="pectorals",
        muscle_group="chest",
        secondary_muscles=[],
        instructions_en="Do it.",
        instructions_ru="Сделай это.",
        instructions_es="Hazlo.",
        steps_en=["Do it."],
        steps_ru=["Сделай это."],
        steps_es=["Hazlo."],
        image_path=extra.pop("image_path", None),
        **extra,
    )


@pytest.fixture
async def exercises(db):
    rows = [
        _exercise("0025", "Жим штанги лёжа", "barbell bench press", image_path="images/0025.jpg"),
        _exercise("0043", "Полный присед со штангой", "barbell full squat", ExerciseBodyPart.upper_legs),
        _exercise(
            "0464",
            "Планка с поворотом",
            "front plank with twist",
            ExerciseBodyPart.waist,
            equipment="body weight",
        ),
    ]
    db.add_all(rows)
    await db.commit()
    return {row.external_id: str(row.id) for row in rows}


def _workout_body(ex: dict[str, str], name: str = "Грудь и ноги") -> dict:
    return {
        "name": name,
        "items": [
            {
                "exercise_id": ex["0025"],
                "mode": "reps",
                "sets": 3,
                "reps": 8,
                "weight_kg": 60,
                "rest_sec": 90,
            },
            {"exercise_id": ex["0464"], "mode": "time", "sets": 2, "duration_sec": 45},
        ],
    }


async def test_full_flow_template_calendar_run_finish(client, exercises):
    user = await register_user(client, "lifter@example.com")
    h = user["headers"]

    resp = await client.post(f"{API}/workouts", json=_workout_body(exercises), headers=h)
    assert resp.status_code == 201, resp.text
    workout = resp.json()
    assert [i["position"] for i in workout["items"]] == [0, 1]
    assert workout["items"][0]["exercise"]["name_ru"] == "Жим штанги лёжа"
    assert workout["items"][0]["exercise"]["has_image"] is True
    assert "image_path" not in workout["items"][0]["exercise"]
    # 3 × (8 × 3 с + 90 с) + 2 × (45 с + 60 с) = 342 + 210 = 552 с → 10 мин
    assert workout["est_duration_min"] == 10

    start = datetime.now(UTC) + timedelta(hours=1)
    resp = await client.post(
        f"{API}/events",
        json={
            "type": "training",
            "planned_start": start.isoformat(),
            "planned_duration_min": workout["est_duration_min"],
            "workout_id": workout["id"],
        },
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    event = resp.json()
    assert event["workout_id"] == workout["id"]
    assert event["workout_name"] == "Грудь и ноги"

    resp = await client.get(f"{API}/events/me", headers=h)
    assert [e["workout_name"] for e in resp.json()] == ["Грудь и ноги"]

    resp = await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)
    assert resp.status_code == 201, resp.text
    session = resp.json()
    assert len(session["sets"]) == 5
    assert session["sets"][0]["planned_reps"] == 8 and session["sets"][0]["reps"] == 8
    assert session["rest_sec_by_position"] == {"0": 90}
    assert session["last_results"] == []
    assert {e["id"] for e in session["exercises"]} == {exercises["0025"], exercises["0464"]}

    resp = await client.get(f"{API}/workout-sessions/active", headers=h)
    assert resp.status_code == 200 and resp.json()["id"] == session["id"]

    sets = session["sets"]
    for s in sets:
        s["done"] = True
    sets[2]["reps"] = 6  # последний подход жима не дожал
    resp = await client.put(f"{API}/workout-sessions/{session['id']}/sets", json={"sets": sets}, headers=h)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sets"][2]["reps"] == 6

    resp = await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"event_id": event["id"], "elapsed_min": 1}

    resp = await client.get(f"{API}/workout-sessions/active", headers=h)
    assert resp.status_code == 204

    # Следующая тренировка по шаблону видит «прошлый раз»
    resp = await client.post(
        f"{API}/workout-sessions",
        json={"workout_id": workout["id"], "date": date.today().isoformat()},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    second = resp.json()
    assert second["event_id"] not in (None, event["id"])
    last = {r["exercise_id"]: r for r in second["last_results"]}
    assert [s["reps"] for s in last[exercises["0025"]]["sets"]] == [8, 8, 6]
    assert [s["duration_sec"] for s in last[exercises["0464"]]["sets"]] == [45, 45]

    resp = await client.get(f"{API}/exercises/{exercises['0025']}/history", headers=h)
    assert resp.status_code == 200
    history = resp.json()
    assert len(history) == 1 and [s["reps"] for s in history[0]["sets"]] == [8, 8, 6]

    resp = await client.get(f"{API}/workout-sessions/me", headers=h)
    rows = resp.json()
    assert len(rows) == 2
    finished = next(r for r in rows if r["id"] == session["id"])
    assert finished["sets_done"] == 5 and finished["sets_total"] == 5 and finished["exercises_count"] == 2


async def test_catalog_search_and_facets(client, exercises):
    user = await register_user(client, "catalog@example.com")
    h = user["headers"]

    resp = await client.get(f"{API}/exercises", params={"q": "штанг"}, headers=h)
    assert resp.status_code == 200
    page = resp.json()
    assert page["total"] == 2
    assert [i["name_ru"] for i in page["items"]] == ["Жим штанги лёжа", "Полный присед со штангой"]

    # По-английски тоже ищется, совпадение с начала названия идёт первым
    resp = await client.get(f"{API}/exercises", params={"q": "bar", "lang": "en"}, headers=h)
    assert [i["name_en"] for i in resp.json()["items"]] == ["barbell bench press", "barbell full squat"]

    resp = await client.get(f"{API}/exercises", params={"body_part": "waist"}, headers=h)
    assert [i["name_ru"] for i in resp.json()["items"]] == ["Планка с поворотом"]

    # % в запросе ищется как символ, а не как шаблон
    resp = await client.get(f"{API}/exercises", params={"q": "%%"}, headers=h)
    assert resp.json()["total"] == 0

    resp = await client.get(f"{API}/exercises/facets", headers=h)
    facets = resp.json()
    assert {"value": "barbell", "count": 2} in facets["equipment"]
    assert {"value": "chest", "count": 1} in facets["body_parts"]

    resp = await client.get(f"{API}/exercises/{exercises['0025']}", headers=h)
    card = resp.json()
    assert card["steps_ru"] == ["Сделай это."] and card["has_gif"] is False


# ---------------------------------------------------------------- хелперы


async def _create_workout(client, h, ex, name="Грудь и ноги") -> dict:
    resp = await client.post(f"{API}/workouts", json=_workout_body(ex, name), headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _personal_event(client, h, workout_id=None) -> dict:
    body = {
        "type": "training",
        "planned_start": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "planned_duration_min": 30,
    }
    if workout_id is not None:
        body["workout_id"] = workout_id
    resp = await client.post(f"{API}/events", json=body, headers=h)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _start_now(client, h, workout_id):
    return await client.post(
        f"{API}/workout-sessions",
        json={"workout_id": workout_id, "date": date.today().isoformat()},
        headers=h,
    )


# ---------------------------------------------------------------- флаг


async def test_flag_off_hides_feature_but_not_catalog(client, exercises, monkeypatch):
    user = await register_user(client, "noflag@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)

    monkeypatch.setattr(settings, "feature_workouts_enabled", False)
    assert (await client.get(f"{API}/workouts/me", headers=h)).status_code == 404
    assert (await client.post(f"{API}/workouts", json=_workout_body(exercises), headers=h)).status_code == 404
    assert (await client.get(f"{API}/workout-sessions/active", headers=h)).status_code == 404
    assert (await _start_now(client, h, workout["id"])).status_code == 404
    assert (await client.get(f"{API}/exercises/{exercises['0025']}/history", headers=h)).status_code == 404
    resp = await client.post(
        f"{API}/events",
        json={
            "type": "training",
            "planned_start": datetime.now(UTC).isoformat(),
            "planned_duration_min": 30,
            "workout_id": workout["id"],
        },
        headers=h,
    )
    assert resp.status_code == 404
    # Справочник бесплатный и флагом не закрыт
    assert (await client.get(f"{API}/exercises", headers=h)).status_code == 200
    assert (await client.get(f"{API}/exercises/{exercises['0025']}", headers=h)).status_code == 200


# ---------------------------------------------------------------- доступ


async def test_foreign_workout_and_session_are_404(client, exercises):
    owner = await register_user(client, "owner@example.com", device_id="device-owner-0001")
    other = await register_user(client, "other@example.com", device_id="device-other-0001")
    workout = await _create_workout(client, owner["headers"], exercises)
    session = (await _start_now(client, owner["headers"], workout["id"])).json()
    oh = other["headers"]

    assert (await client.get(f"{API}/workouts/{workout['id']}", headers=oh)).status_code == 404
    assert (
        await client.put(f"{API}/workouts/{workout['id']}", json=_workout_body(exercises), headers=oh)
    ).status_code == 404
    assert (await client.delete(f"{API}/workouts/{workout['id']}", headers=oh)).status_code == 404
    assert (await client.get(f"{API}/workouts/me", headers=oh)).json() == []

    assert (await client.get(f"{API}/workout-sessions/{session['id']}", headers=oh)).status_code == 404
    resp = await client.put(f"{API}/workout-sessions/{session['id']}/sets", json={"sets": []}, headers=oh)
    assert resp.status_code == 404
    assert (
        await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=oh)
    ).status_code == 404
    assert (await client.delete(f"{API}/workout-sessions/{session['id']}", headers=oh)).status_code == 404
    assert (await client.get(f"{API}/workout-sessions/active", headers=oh)).status_code == 204
    assert (await client.get(f"{API}/workout-sessions/me", headers=oh)).json() == []
    resp = await client.get(f"{API}/exercises/{exercises['0025']}/history", headers=oh)
    assert resp.json() == []

    # Чужой шаблон нельзя ни начать, ни поставить в своё событие
    assert (await _start_now(client, oh, workout["id"])).status_code == 404
    resp = await client.post(
        f"{API}/events",
        json={
            "type": "training",
            "planned_start": datetime.now(UTC).isoformat(),
            "planned_duration_min": 30,
            "workout_id": workout["id"],
        },
        headers=oh,
    )
    assert resp.status_code == 404
    # Чужое событие с шаблоном нельзя начать
    own_event = await _personal_event(client, owner["headers"], workout["id"])
    resp = await client.post(f"{API}/workout-sessions", json={"event_id": own_event["id"]}, headers=oh)
    assert resp.status_code == 404


async def test_team_staff_does_not_see_athlete_workouts(client, exercises):
    from tests.test_authz import build_org

    org = await build_org(client)
    athlete_h = org["athlete1"]["headers"]
    workout = await _create_workout(client, athlete_h, exercises)
    session = (await _start_now(client, athlete_h, workout["id"])).json()

    for role in ("coach", "medic", "admin"):
        h = org[role]["headers"]
        assert (await client.get(f"{API}/workouts/{workout['id']}", headers=h)).status_code == 404, role
        assert (
            await client.get(f"{API}/workout-sessions/{session['id']}", headers=h)
        ).status_code == 404, role


async def test_workout_only_on_personal_event(client, exercises):
    from tests.test_authz import build_org

    org = await build_org(client)
    coach_h = org["coach"]["headers"]
    workout = await _create_workout(client, coach_h, exercises)
    resp = await client.post(
        f"{API}/events",
        json={
            "team_id": org["team_id"],
            "type": "training",
            "planned_start": datetime.now(UTC).isoformat(),
            "planned_duration_min": 60,
            "workout_id": workout["id"],
        },
        headers=coach_h,
    )
    assert resp.status_code == 422

    resp = await client.post(
        f"{API}/events",
        json={
            "team_id": org["team_id"],
            "type": "training",
            "planned_start": datetime.now(UTC).isoformat(),
            "planned_duration_min": 60,
        },
        headers=coach_h,
    )
    team_event = resp.json()
    resp = await client.patch(
        f"{API}/events/{team_event['id']}", json={"workout_id": workout["id"]}, headers=coach_h
    )
    assert resp.status_code == 422
    # Командное событие не начать как тренировку из конструктора
    resp = await client.post(f"{API}/workout-sessions", json={"event_id": team_event["id"]}, headers=coach_h)
    assert resp.status_code == 404


# ---------------------------------------------------------------- валидация и лимиты


async def test_unknown_exercise_and_bad_mode_are_422(client, exercises):
    user = await register_user(client, "valid@example.com")
    h = user["headers"]
    body = _workout_body(exercises)
    body["items"][0]["exercise_id"] = "00000000-0000-0000-0000-000000000000"
    assert (await client.post(f"{API}/workouts", json=body, headers=h)).status_code == 422

    body = _workout_body(exercises)
    del body["items"][0]["reps"]
    assert (await client.post(f"{API}/workouts", json=body, headers=h)).status_code == 422

    body = _workout_body(exercises)
    body["items"][1]["weight_kg"] = 10  # у упражнения на время веса нет
    assert (await client.post(f"{API}/workouts", json=body, headers=h)).status_code == 422


async def test_workouts_limit_per_user(client, exercises, monkeypatch):
    from app.services import workouts_service

    monkeypatch.setattr(workouts_service, "MAX_WORKOUTS_PER_USER", 2)
    user = await register_user(client, "limit@example.com")
    h = user["headers"]
    await _create_workout(client, h, exercises, "Первая")
    await _create_workout(client, h, exercises, "Вторая")
    resp = await client.post(f"{API}/workouts", json=_workout_body(exercises, "Третья"), headers=h)
    assert resp.status_code == 409


# ---------------------------------------------------------------- конфликты сессий


async def test_one_active_session_per_user(client, exercises):
    user = await register_user(client, "busy@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    first = (await _start_now(client, h, workout["id"])).json()

    resp = await _start_now(client, h, workout["id"])
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "active_session"
    assert resp.json()["detail"]["session_id"] == first["id"]
    # Неудачный старт не оставил лишнего события
    events = (await client.get(f"{API}/events/me", headers=h)).json()
    assert len(events) == 1


async def test_event_session_conflicts(client, exercises):
    user = await register_user(client, "event@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)

    plain = await _personal_event(client, h)
    resp = await client.post(f"{API}/workout-sessions", json={"event_id": plain["id"]}, headers=h)
    assert resp.status_code == 422

    event = await _personal_event(client, h, workout["id"])
    session = (await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)).json()
    await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)

    resp = await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)
    assert resp.status_code == 409
    assert resp.json()["detail"] == {
        "code": "event_has_session",
        "message": "Эта тренировка уже выполнялась",
        "session_id": session["id"],
    }

    resp = await client.put(f"{API}/workout-sessions/{session['id']}/sets", json={"sets": []}, headers=h)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "session_finished"
    resp = await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "session_finished"


async def test_discard_keeps_event_and_allows_restart(client, exercises):
    user = await register_user(client, "discard@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    event = await _personal_event(client, h, workout["id"])
    session = (await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)).json()

    assert (await client.delete(f"{API}/workout-sessions/{session['id']}", headers=h)).status_code == 204
    assert [e["id"] for e in (await client.get(f"{API}/events/me", headers=h)).json()] == [event["id"]]
    resp = await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)
    assert resp.status_code == 201


async def test_sets_validation(client, exercises):
    user = await register_user(client, "sets@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    session = (await _start_now(client, h, workout["id"])).json()
    sets = session["sets"]

    duplicate = [sets[0], sets[0]]
    resp = await client.put(
        f"{API}/workout-sessions/{session['id']}/sets", json={"sets": duplicate}, headers=h
    )
    assert resp.status_code == 422

    foreign = [{**sets[0], "exercise_id": "00000000-0000-0000-0000-000000000000"}]
    resp = await client.put(f"{API}/workout-sessions/{session['id']}/sets", json={"sets": foreign}, headers=h)
    assert resp.status_code == 422

    # Добавленный на ходу подход без плана
    extra = {
        **sets[2],
        "set_index": 3,
        "planned_reps": None,
        "planned_weight_kg": None,
        "reps": 5,
        "done": True,
    }
    resp = await client.put(
        f"{API}/workout-sessions/{session['id']}/sets", json={"sets": [*sets, extra]}, headers=h
    )
    assert resp.status_code == 200
    assert len(resp.json()["sets"]) == 6


# ---------------------------------------------------------------- длительность и правки шаблона


async def test_finish_elapsed_is_clamped(client, exercises, db):
    from app.models.workout import WorkoutSession

    user = await register_user(client, "long@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    session = (await _start_now(client, h, workout["id"])).json()

    row = await db.get(WorkoutSession, session["id"])
    row.started_at = datetime.now(UTC) - timedelta(minutes=95, seconds=10)
    await db.commit()
    resp = await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)
    assert resp.json()["elapsed_min"] == 96

    second = (await _start_now(client, h, workout["id"])).json()
    row = await db.get(WorkoutSession, second["id"])
    row.started_at = datetime.now(UTC) - timedelta(hours=30)  # забыли нажать «Завершить»
    await db.commit()
    resp = await client.post(f"{API}/workout-sessions/{second['id']}/finish", headers=h)
    assert resp.json()["elapsed_min"] == 600


async def test_rest_not_shown_after_template_reorder(client, exercises):
    user = await register_user(client, "reorder@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    session = (await _start_now(client, h, workout["id"])).json()
    assert session["rest_sec_by_position"] == {"0": 90}

    body = _workout_body(exercises)
    body["items"].reverse()
    resp = await client.put(f"{API}/workouts/{workout['id']}", json=body, headers=h)
    assert resp.status_code == 200
    assert resp.json()["updated_at"] > workout["updated_at"]
    assert [i["exercise"]["id"] for i in resp.json()["items"]] == [exercises["0464"], exercises["0025"]]

    resp = await client.get(f"{API}/workout-sessions/{session['id']}", headers=h)
    assert resp.json()["rest_sec_by_position"] == {}
    # План уже идущей тренировки шаблон не трогает
    assert resp.json()["sets"][0]["exercise_id"] == exercises["0025"]


async def test_delete_workout_keeps_event_and_history(client, exercises):
    user = await register_user(client, "cleanup@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    event = await _personal_event(client, h, workout["id"])
    session = (await client.post(f"{API}/workout-sessions", json={"event_id": event["id"]}, headers=h)).json()
    await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)

    assert (await client.delete(f"{API}/workouts/{workout['id']}", headers=h)).status_code == 204
    events = (await client.get(f"{API}/events/me", headers=h)).json()
    assert events[0]["id"] == event["id"]
    assert events[0]["workout_id"] is None and events[0]["workout_name"] is None
    resp = await client.get(f"{API}/workout-sessions/{session['id']}", headers=h)
    assert resp.status_code == 200
    assert resp.json()["workout_id"] is None and resp.json()["workout_name"] == "Грудь и ноги"


async def test_event_workout_can_be_removed(client, exercises):
    user = await register_user(client, "unplan@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    event = await _personal_event(client, h)
    resp = await client.patch(f"{API}/events/{event['id']}", json={"workout_id": workout["id"]}, headers=h)
    assert resp.json()["workout_name"] == "Грудь и ноги"
    resp = await client.patch(f"{API}/events/{event['id']}", json={"workout_id": None}, headers=h)
    assert resp.status_code == 200 and resp.json()["workout_id"] is None


# ---------------------------------------------------------------- удаление аккаунта


async def test_account_deletion_removes_workouts(client, exercises, db):
    from sqlalchemy import func, select

    from app.models.workout import Workout, WorkoutItem, WorkoutSession, WorkoutSessionSet

    user = await register_user(client, "gone@example.com")
    h = user["headers"]
    workout = await _create_workout(client, h, exercises)
    session = (await _start_now(client, h, workout["id"])).json()
    await client.post(f"{API}/workout-sessions/{session['id']}/finish", headers=h)

    assert (await client.delete(f"{API}/account", headers=h)).status_code == 204
    for model in (Workout, WorkoutItem, WorkoutSession, WorkoutSessionSet):
        assert await db.scalar(select(func.count()).select_from(model)) == 0, model.__name__
