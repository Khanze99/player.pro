"""Раздача медиа упражнений (docs/plan-exercise-catalog.md).

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

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exercise import Exercise

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
