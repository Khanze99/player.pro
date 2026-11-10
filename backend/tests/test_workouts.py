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
