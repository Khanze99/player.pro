"""Справочник упражнений (docs/plan-exercise-catalog.md).

Источник: https://github.com/hasaneyldrm/exercises-dataset (MIT на данные/код).
Файл `exercises.json` в репозиторий не кладём (17 МБ, как и дамп Open Food Facts) —
путь передаётся аргументом.

Названия (`name`) в датасете только на английском. Перевод на ru/es делается
отдельно и живёт в `exercise_translations.json` (ключ — external_id датасета) —
то, что в нём не покрыто, подставляется как name_en, без тихого брака: лучше
честно показать английское название, чем притвориться переводом (см. находку в
обсуждении: бесплатный MT путает sit-up со squat). Довести перевод до 100% —
отдельная задача, см. docs/plan-exercise-catalog.md.

Картинки/GIF не копируются — только относительный путь из датасета и текст
атрибуции Gym Visual. Идемпотентно: upsert по external_id (как у
uq_food_items_off_barcode/import_foods.py), повторный прогон не плодит дубли.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import ExerciseBodyPart, ExerciseSource  # noqa: E402
from app.models.exercise import Exercise  # noqa: E402

DEFAULT_TRANSLATIONS = Path(__file__).parent / "exercise_translations.json"

UPDATABLE = [
    "name_en",
    "name_ru",
    "name_es",
    "body_part",
    "equipment",
    "target",
    "muscle_group",
    "secondary_muscles",
    "instructions_en",
    "instructions_ru",
    "instructions_es",
    "steps_en",
    "steps_ru",
    "steps_es",
    "image_path",
    "gif_path",
    "attribution",
]


def _load_translations(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _row_values(record: dict, translations: dict[str, dict[str, str]]) -> dict:
    external_id = record["id"]
    name_en = record["name"]
    override = translations.get(external_id)
    name_ru = override["ru"] if override else name_en
    name_es = override["es"] if override else name_en

    instructions = record["instructions"]
    steps = record["instruction_steps"]

    return dict(
        source=ExerciseSource.exercises_dataset,
        external_id=external_id,
        name_en=name_en,
        name_ru=name_ru,
        name_es=name_es,
        body_part=ExerciseBodyPart(record["body_part"].replace(" ", "_")),
        equipment=record["equipment"],
        target=record["target"],
        muscle_group=record["muscle_group"],
        secondary_muscles=record["secondary_muscles"],
        instructions_en=instructions["en"],
        instructions_ru=instructions["ru"],
        instructions_es=instructions["es"],
        steps_en=steps["en"],
        steps_ru=steps["ru"],
        steps_es=steps["es"],
        image_path=record.get("image"),
        gif_path=record.get("gif_url"),
        attribution=record.get("attribution"),
    )


async def _flush(db, batch: dict[str, dict]) -> None:
    if not batch:
        return
    stmt = insert(Exercise).values(list(batch.values()))
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=["external_id"],
            index_where=text("source = 'exercises_dataset' AND external_id IS NOT NULL"),
            set_={field: getattr(stmt.excluded, field) for field in UPDATABLE},
        )
    )
    await db.commit()


async def import_exercises(
    file: Path, translations_path: Path, limit: int, batch_size: int
) -> tuple[int, int]:
    records = json.loads(file.read_text(encoding="utf-8"))
    translations = _load_translations(translations_path)
    translated = sum(1 for r in records if r["id"] in translations)

    async with AsyncSessionLocal() as db:
        seen = 0
        batch: dict[str, dict] = {}
        for record in records:
            if limit and seen >= limit:
                break
            values = _row_values(record, translations)
            batch[values["external_id"]] = values  # дедуп внутри батча — id уникален в датасете
            seen += 1
            if len(batch) >= batch_size:
                await _flush(db, batch)
                batch = {}
        await _flush(db, batch)
    return seen, translated


def main() -> None:
    parser = argparse.ArgumentParser(description="Справочник упражнений PlayerPro")
    parser.add_argument("--file", type=Path, required=True, help="путь к exercises.json датасета")
    parser.add_argument(
        "--translations",
        type=Path,
        default=DEFAULT_TRANSLATIONS,
        help="переводы name_ru/name_es (JSON по external_id)",
    )
    parser.add_argument("--limit", type=int, default=0, help="максимум записей; 0 — без ограничения")
    parser.add_argument("--batch", type=int, default=200, help="размер батча upsert")
    args = parser.parse_args()

    print(f"Импорт упражнений из {args.file}")
    seen, translated = asyncio.run(import_exercises(args.file, args.translations, args.limit, args.batch))
    untranslated = seen - translated
    print(f"Готово. Обработано: {seen}. С переводом ru/es: {translated}.")
    print(f"Без перевода (name_en как заглушка): {untranslated}.")


if __name__ == "__main__":
    main()
