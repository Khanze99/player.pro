"""Раздача медиа упражнений (app/services/exercise_service.py,
docs/plan-exercise-catalog.md): GET /exercises/{id}/image и .../gif.

Публичный для всех авторизованных контент (не персданные, в отличие от
аватара), но раздаётся через свой эндпоинт, не голой статикой — см. docстроку
exercise_service.
"""

import uuid

from app.models.enums import ExerciseBodyPart, ExerciseSource
from app.models.exercise import Exercise
from tests.conftest import register_user


def _exercise(**overrides) -> Exercise:
    values = dict(
        source=ExerciseSource.exercises_dataset,
        external_id="0001",
        name_en="3/4 sit-up",
        name_ru="Скручивания на 3/4",
        name_es="Abdominales 3/4",
        body_part=ExerciseBodyPart.waist,
        equipment="body weight",
        target="abs",
        muscle_group="abs",
        secondary_muscles=["hip flexors"],
        instructions_en="Do it.",
        instructions_ru="Сделай это.",
        instructions_es="Hazlo.",
        steps_en=["Do it."],
        steps_ru=["Сделай это."],
        steps_es=["Hazlo."],
        image_path="images/0001.jpg",
        gif_path="videos/0001.gif",
        attribution="© Gym visual — https://gymvisual.com/",
    )
    values.update(overrides)
    return Exercise(**values)


async def test_image_and_gif_served_when_files_exist(client, db, monkeypatch, tmp_path):
    from app.services import exercise_service

    monkeypatch.setattr(exercise_service, "media_dir", lambda: tmp_path)
    (tmp_path / "images").mkdir()
    (tmp_path / "videos").mkdir()
    (tmp_path / "images" / "0001.jpg").write_bytes(b"fake-jpg")
    (tmp_path / "videos" / "0001.gif").write_bytes(b"fake-gif")

    exercise = _exercise()
    db.add(exercise)
    await db.commit()

    user = await register_user(client, "exercise-viewer@example.com")

    image = await client.get(f"/api/v1/exercises/{exercise.id}/image", headers=user["headers"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content == b"fake-jpg"

    gif = await client.get(f"/api/v1/exercises/{exercise.id}/gif", headers=user["headers"])
    assert gif.status_code == 200
    assert gif.headers["content-type"] == "image/gif"
    assert gif.content == b"fake-gif"


async def test_404_when_exercise_missing(client):
    user = await register_user(client, "exercise-404@example.com")
    resp = await client.get(f"/api/v1/exercises/{uuid.uuid4()}/image", headers=user["headers"])
    assert resp.status_code == 404


async def test_404_when_file_missing_on_disk(client, db, monkeypatch, tmp_path):
    """Строка в БД есть, файла на диске нет — например, импорт прогнали без
    медиа. Эндпоинт не должен падать 500."""
    from app.services import exercise_service

    monkeypatch.setattr(exercise_service, "media_dir", lambda: tmp_path)

    exercise = _exercise()
    db.add(exercise)
    await db.commit()

    user = await register_user(client, "exercise-nofile@example.com")
    resp = await client.get(f"/api/v1/exercises/{exercise.id}/image", headers=user["headers"])
    assert resp.status_code == 404
