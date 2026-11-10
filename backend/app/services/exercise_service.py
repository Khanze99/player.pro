"""Справочник упражнений: поиск, фильтры, карточка (docs/plan-workout-builder.md)
и раздача медиа (docs/plan-exercise-catalog.md).

В отличие от аватара (персданные, доступ только автору/по authz) картинка и GIF
упражнения — один и тот же публичный контент для всех: приватности тут нет, но
раздаём через свой эндпоинт, а не голой статикой (`/static`), чтобы при смене
способа хранения (CDN, объектное хранилище) URL для клиента не менялись.

Атрибуция Gym Visual (`Exercise.attribution`) обязана остаться видимой в
интерфейсе там, где показывается картинка/GIF — это условие лицензии на медиа,
не этого эндпоинта.
"""

from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import ExerciseBodyPart
from app.models.exercise import Exercise
from app.schemas.exercise import ExerciseFacetsOut, ExercisePage, ExerciseShortOut, FacetValue

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def media_dir() -> Path:
    return _BACKEND_ROOT / settings.media_dir / "exercises"


async def get(db: AsyncSession, exercise_id: UUID) -> Exercise | None:
    return await db.get(Exercise, exercise_id)


def image_path(exercise: Exercise) -> Path | None:
    """Путь к картинке упражнения на диске, если файл есть."""
    if not exercise.image_path:
        return None
    path = media_dir() / exercise.image_path
    return path if path.is_file() else None


def gif_path(exercise: Exercise) -> Path | None:
    """Путь к GIF упражнения на диске, если файл есть."""
    if not exercise.gif_path:
        return None
    path = media_dir() / exercise.gif_path
    return path if path.is_file() else None


_NAME_COLUMNS = {"ru": Exercise.name_ru, "en": Exercise.name_en, "es": Exercise.name_es}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def get_or_404(db: AsyncSession, exercise_id: UUID) -> Exercise:
    exercise = await get(db, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    return exercise


async def search(
    db: AsyncSession,
    *,
    q: str | None,
    body_part: ExerciseBodyPart | None,
    equipment: str | None,
    lang: str,
    limit: int,
    offset: int,
) -> ExercisePage:
    """ILIKE по трём языкам сразу: пользователь может искать и по-английски.
    1324 строки, последовательный скан дешевле, чем pg_trgm. Сортировка: сначала
    совпадение с начала названия на языке интерфейса, потом по алфавиту."""
    name_col = _NAME_COLUMNS.get(lang, Exercise.name_ru)
    conditions = []
    order = []
    if q:
        needle = _escape_like(q.strip())
        pattern = f"%{needle}%"
        conditions.append(or_(*(col.ilike(pattern, escape="\\") for col in _NAME_COLUMNS.values())))
        order.append(case((name_col.ilike(f"{needle}%", escape="\\"), 0), else_=1))
    if body_part is not None:
        conditions.append(Exercise.body_part == body_part)
    if equipment:
        conditions.append(Exercise.equipment == equipment)

    total = await db.scalar(select(func.count()).select_from(Exercise).where(*conditions))
    rows = await db.scalars(
        select(Exercise)
        .where(*conditions)
        .order_by(*order, name_col, Exercise.id)
        .limit(limit)
        .offset(offset)
    )
    return ExercisePage(
        items=[ExerciseShortOut.model_validate(row) for row in rows],
        total=total or 0,
    )


async def facets(db: AsyncSession) -> ExerciseFacetsOut:
    async def _count(column) -> list[FacetValue]:
        rows = await db.execute(
            select(column, func.count()).group_by(column).order_by(func.count().desc(), column)
        )
        return [FacetValue(value=str(value), count=count) for value, count in rows]

    return ExerciseFacetsOut(
        body_parts=await _count(Exercise.body_part), equipment=await _count(Exercise.equipment)
    )


async def existing_ids(db: AsyncSession, ids: set[UUID]) -> set[UUID]:
    if not ids:
        return set()
    rows = await db.scalars(select(Exercise.id).where(Exercise.id.in_(ids)))
    return set(rows)


async def ensure_exist(db: AsyncSession, ids: set[UUID]) -> None:
    """422, если какого-то упражнения нет в справочнике."""
    missing = ids - await existing_ids(db, ids)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Упражнение не найдено в справочнике",
        )
