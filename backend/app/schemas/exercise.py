"""Справочник упражнений (docs/plan-workout-builder.md, раздел «API»).

Названия и шаги отдаются на всех трёх языках, язык выбирает клиент. Пути к файлам
наружу не уходят: клиент получает только флаги has_image/has_gif и берёт файл
через GET /exercises/{id}/image и /gif.
"""

import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field, computed_field

from app.models.enums import ExerciseBodyPart, WorkoutItemMode

SEARCH_MIN_LENGTH = 2
PAGE_LIMIT_DEFAULT = 50
PAGE_LIMIT_MAX = 100
HISTORY_LIMIT_MAX = 50


class ExerciseShortOut(BaseModel):
    """Строка списка и выбора упражнения."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name_ru: str
    name_en: str
    name_es: str
    body_part: ExerciseBodyPart
    equipment: str
    target: str
    image_path: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_image(self) -> bool:
        return self.image_path is not None


class ExerciseOut(ExerciseShortOut):
    """Карточка упражнения."""

    muscle_group: str
    secondary_muscles: list[str]
    steps_ru: list[str]
    steps_en: list[str]
    steps_es: list[str]
    attribution: str | None
    gif_path: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_gif(self) -> bool:
        return self.gif_path is not None


class ExercisePage(BaseModel):
    items: list[ExerciseShortOut]
    total: int


class FacetValue(BaseModel):
    value: str
    count: int


class ExerciseFacetsOut(BaseModel):
    """Значения фильтров с числом упражнений: экран строит чипы без хардкода."""

    body_parts: list[FacetValue]
    equipment: list[FacetValue]


class HistorySetOut(BaseModel):
    model_config = {"from_attributes": True}

    set_index: int
    reps: int | None
    weight_kg: float | None
    duration_sec: int | None
    done: bool


class ExerciseHistoryOut(BaseModel):
    """Одна прошлая тренировка с этим упражнением: только мои сессии."""

    session_id: uuid.UUID
    date: date_type
    workout_name: str
    mode: WorkoutItemMode
    sets: list[HistorySetOut]
