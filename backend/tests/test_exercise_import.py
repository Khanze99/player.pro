"""Импорт справочника упражнений (scripts/import_exercises.py,
docs/plan-exercise-catalog.md).

Проверяем ту же ловушку, что и у импорта продуктов: повторный прогон не должен
плодить дубли, а будущее личное/клубное упражнение не должно блокироваться или
затираться импортом датасета.
"""

import importlib.util
import uuid
from pathlib import Path

from sqlalchemy import select

from app.models.enums import ExerciseBodyPart, ExerciseSource, UserStatus
from app.models.exercise import Exercise
from app.models.user import User


def _load_script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "import_exercises.py"
    spec = importlib.util.spec_from_file_location("import_exercises", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exercises = _load_script()


def _record(external_id: str, name: str, **overrides) -> dict:
    record = {
        "id": external_id,
        "name": name,
        "category": "waist",
        "body_part": "waist",
        "equipment": "body weight",
        "instructions": {"en": "Do it.", "ru": "Сделай это.", "es": "Hazlo."},
        "instruction_steps": {"en": ["Do it."], "ru": ["Сделай это."], "es": ["Hazlo."]},
        "muscle_group": "abs",
        "secondary_muscles": ["hip flexors"],
        "target": "abs",
        "image": f"images/{external_id}.jpg",
        "gif_url": f"videos/{external_id}.gif",
        "attribution": "© Gym visual — https://gymvisual.com/",
    }
    record.update(overrides)
    return record


# ------------------------------------------------------------------ разбор записи


def test_row_values_maps_body_part_enum():
    """Датасет отдаёт body_part с пробелом («lower arms»), в БД — enum с
    подчёркиванием. Спутать с BodyRegion (карта боли) нельзя — это другой enum."""
    values = exercises._row_values(_record("0001", "3/4 sit-up", body_part="lower arms"), {})
    assert values["body_part"] == ExerciseBodyPart.lower_arms
    assert values["source"] == ExerciseSource.exercises_dataset


def test_row_values_without_translation_falls_back_to_english():
    """Без перевода — честная заглушка name_en, а не угаданный MT-перевод."""
    values = exercises._row_values(_record("0001", "3/4 sit-up"), {})
    assert values["name_en"] == values["name_ru"] == values["name_es"] == "3/4 sit-up"


def test_row_values_applies_translation_override():
    translations = {"0001": {"ru": "Скручивания на 3/4", "es": "Abdominales 3/4"}}
    values = exercises._row_values(_record("0001", "3/4 sit-up"), translations)
    assert values["name_ru"] == "Скручивания на 3/4"
    assert values["name_es"] == "Abdominales 3/4"
    assert values["name_en"] == "3/4 sit-up"


# ------------------------------------------------------------------ upsert


async def _dataset_rows(db) -> list[Exercise]:
    rows = await db.execute(
        select(Exercise)
        .where(Exercise.source == ExerciseSource.exercises_dataset)
        .order_by(Exercise.external_id)
    )
    return list(rows.scalars())


async def test_repeated_flush_updates_instead_of_duplicating(db):
    """Главная причина, по которой импорт нельзя гонять как есть: второй прогон
    датасета удваивал бы каталог."""
    first = exercises._row_values(_record("0001", "3/4 sit-up"), {})
    await exercises._flush(db, {first["external_id"]: first})

    second = exercises._row_values(_record("0001", "3/4 sit-up (уточнили)"), {})
    await exercises._flush(db, {second["external_id"]: second})

    rows = await _dataset_rows(db)
    assert len(rows) == 1
    assert rows[0].name_en == "3/4 sit-up (уточнили)"


async def test_custom_exercise_with_same_external_id_survives_import(db):
    """Частичный индекс покрывает только слой датасета. Личное/клубное упражнение
    (source=custom) с тем же external_id не должно блокировать импорт и не должно
    быть затёрто."""
    user = User(
        last_name="Игрок",
        email=f"{uuid.uuid4().hex[:8]}@test.com",
        status=UserStatus.active,
    )
    db.add(user)
    await db.flush()
    own = Exercise(
        source=ExerciseSource.custom,
        external_id="0001",
        name_en="Моё упражнение",
        name_ru="Моё упражнение",
        name_es="Моё упражнение",
        body_part=ExerciseBodyPart.waist,
        equipment="body weight",
        target="abs",
        muscle_group="abs",
        secondary_muscles=[],
        instructions_en="",
        instructions_ru="",
        instructions_es="",
        steps_en=[],
        steps_ru=[],
        steps_es=[],
        created_by=user.id,
    )
    db.add(own)
    await db.commit()

    values = exercises._row_values(_record("0001", "3/4 sit-up"), {})
    await exercises._flush(db, {values["external_id"]: values})

    await db.refresh(own)
    assert own.name_en == "Моё упражнение"
    assert len(await _dataset_rows(db)) == 1
