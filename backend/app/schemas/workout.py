"""Шаблоны тренировок и их выполнение (docs/plan-workout-builder.md, раздел «API»).

Ошибки, которые отдаёт сервис (схемы их не проверяют, нужна БД):
- 404: чужой или несуществующий шаблон, сессия, событие (чужое не отличаем от
  отсутствующего, как в дневнике питания);
- 422: exercise_id нет в справочнике; workout_id у командного события;
- 409 с detail = {"code", "message", "session_id"}:
  code="active_session" (уже есть незавершённая сессия, session_id = она),
  code="event_has_session" (у события уже есть выполнение, session_id = оно),
  code="session_finished" (правка подходов завершённой сессии).
"""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import WorkoutItemMode
from app.schemas.exercise import ExerciseShortOut

MAX_WORKOUTS_PER_USER = 100
MAX_ITEMS = 30
MAX_SETS = 20
MAX_REPS = 100
MAX_WEIGHT_KG = 500
MIN_DURATION_SEC = 5
MAX_DURATION_SEC = 3600
MAX_REST_SEC = 600
# Подходы в сессии: шаблонные плюс добавленные на ходу, но не бесконечно
MAX_SESSION_SETS = MAX_ITEMS * MAX_SETS


def _check_mode_fields(
    mode: WorkoutItemMode, reps: int | None, weight_kg: float | None, duration_sec: int | None
) -> None:
    """reps-упражнение: повторы (вес опционален), без времени; time: только время."""
    if mode is WorkoutItemMode.reps:
        if duration_sec is not None:
            raise ValueError("Для упражнения на повторы время не задаётся")
    elif reps is not None or weight_kg is not None:
        raise ValueError("Для упражнения на время повторы и вес не задаются")


# ------------------------------------------------------------------ шаблоны


class WorkoutItemIn(BaseModel):
    exercise_id: uuid.UUID
    mode: WorkoutItemMode
    sets: int = Field(ge=1, le=MAX_SETS)
    reps: int | None = Field(default=None, ge=1, le=MAX_REPS)
    weight_kg: float | None = Field(default=None, ge=0, le=MAX_WEIGHT_KG)
    duration_sec: int | None = Field(default=None, ge=MIN_DURATION_SEC, le=MAX_DURATION_SEC)
    rest_sec: int | None = Field(default=None, ge=0, le=MAX_REST_SEC)
    notes: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _mode_fields(self) -> "WorkoutItemIn":
        _check_mode_fields(self.mode, self.reps, self.weight_kg, self.duration_sec)
        if self.mode is WorkoutItemMode.reps and self.reps is None:
            raise ValueError("Укажите число повторов")
        if self.mode is WorkoutItemMode.time and self.duration_sec is None:
            raise ValueError("Укажите время подхода")
        return self


class WorkoutIn(BaseModel):
    """POST /workouts и PUT /workouts/{id}: PUT заменяет шаблон целиком.
    Порядок items = порядок упражнений в тренировке."""

    name: str = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[WorkoutItemIn] = Field(min_length=1, max_length=MAX_ITEMS)
    # False: план конкретного события («Добавить упражнения» при создании события),
    # в списке шаблонов не показывается. Задаётся только при создании, PUT его не меняет.
    is_template: bool = True

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Название не может быть пустым")
        return value


class WorkoutItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    position: int
    exercise: ExerciseShortOut
    mode: WorkoutItemMode
    sets: int
    reps: int | None
    weight_kg: float | None
    duration_sec: int | None
    rest_sec: int | None
    notes: str | None


class WorkoutOut(BaseModel):
    id: uuid.UUID
    name: str
    notes: str | None
    is_template: bool
    items: list[WorkoutItemOut]
    est_duration_min: int
    created_at: datetime
    updated_at: datetime


class WorkoutShortOut(BaseModel):
    id: uuid.UUID
    name: str
    items_count: int
    est_duration_min: int
    updated_at: datetime


# ------------------------------------------------------------------ выполнение


class WorkoutSessionStartIn(BaseModel):
    """Ровно один из вариантов:
    - {event_id}: начать запланированное личное событие с шаблоном;
    - {workout_id, date}: «начать сейчас», сервис сам создаёт личное событие.
      date = сегодняшний день в таймзоне клиента."""

    event_id: uuid.UUID | None = None
    workout_id: uuid.UUID | None = None
    date: date_type | None = None

    @model_validator(mode="after")
    def _one_source(self) -> "WorkoutSessionStartIn":
        if (self.event_id is None) == (self.workout_id is None):
            raise ValueError("Нужен либо event_id, либо workout_id")
        if self.workout_id is not None and self.date is None:
            raise ValueError("Для старта без события нужна дата")
        if self.event_id is not None and self.date is not None:
            raise ValueError("Дата берётся из события")
        return self


class SessionSetIn(BaseModel):
    """Подход в PUT /workout-sessions/{id}/sets (полная замена списка).
    planned_* клиент возвращает как получил; у подхода, добавленного на ходу, их нет."""

    position: int = Field(ge=0, lt=MAX_ITEMS)
    exercise_id: uuid.UUID
    set_index: int = Field(ge=0, lt=MAX_SETS)
    mode: WorkoutItemMode
    planned_reps: int | None = Field(default=None, ge=1, le=MAX_REPS)
    planned_weight_kg: float | None = Field(default=None, ge=0, le=MAX_WEIGHT_KG)
    planned_duration_sec: int | None = Field(default=None, ge=MIN_DURATION_SEC, le=MAX_DURATION_SEC)
    reps: int | None = Field(default=None, ge=0, le=MAX_REPS)
    weight_kg: float | None = Field(default=None, ge=0, le=MAX_WEIGHT_KG)
    duration_sec: int | None = Field(default=None, ge=0, le=MAX_DURATION_SEC)
    done: bool = False

    @model_validator(mode="after")
    def _mode_fields(self) -> "SessionSetIn":
        _check_mode_fields(self.mode, self.planned_reps, self.planned_weight_kg, self.planned_duration_sec)
        _check_mode_fields(self.mode, self.reps, self.weight_kg, self.duration_sec)
        return self


class SessionSetsIn(BaseModel):
    sets: list[SessionSetIn] = Field(max_length=MAX_SESSION_SETS)

    @model_validator(mode="after")
    def _unique_slots(self) -> "SessionSetsIn":
        slots = [(s.position, s.set_index) for s in self.sets]
        if len(slots) != len(set(slots)):
            raise ValueError("Подход с такой позицией и номером передан дважды")
        exercise_by_position: dict[int, uuid.UUID] = {}
        for s in self.sets:
            if exercise_by_position.setdefault(s.position, s.exercise_id) != s.exercise_id:
                raise ValueError("На одной позиции может быть только одно упражнение")
        return self


class SessionSetOut(BaseModel):
    model_config = {"from_attributes": True}

    position: int
    exercise_id: uuid.UUID
    set_index: int
    mode: WorkoutItemMode
    planned_reps: int | None
    planned_weight_kg: float | None
    planned_duration_sec: int | None
    reps: int | None
    weight_kg: float | None
    duration_sec: int | None
    done: bool


class LastSetOut(BaseModel):
    reps: int | None
    weight_kg: float | None
    duration_sec: int | None


class LastResultOut(BaseModel):
    """«Прошлый раз» по упражнению: последняя завершённая сессия, только выполненные подходы."""

    exercise_id: uuid.UUID
    date: date_type
    sets: list[LastSetOut]


class WorkoutSessionOut(BaseModel):
    """Всё для экрана выполнения одним запросом: подходы, карточки упражнений,
    прошлые результаты, rest_sec из шаблона по позициям."""

    id: uuid.UUID
    # Чьё выполнение: штаб открывает выполнение игрока командного события только
    # для чтения, экран сравнивает с собой
    athlete_id: uuid.UUID
    event_id: uuid.UUID | None
    workout_id: uuid.UUID | None
    workout_name: str
    date: date_type
    started_at: datetime
    finished_at: datetime | None
    sets: list[SessionSetOut]
    exercises: list[ExerciseShortOut]
    rest_sec_by_position: dict[int, int]
    last_results: list[LastResultOut]


class WorkoutSessionShortOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID | None
    workout_name: str
    date: date_type
    started_at: datetime
    finished_at: datetime | None
    exercises_count: int
    sets_done: int
    sets_total: int


class WorkoutSessionFinishOut(BaseModel):
    """Клиент открывает RPE с этим событием и длительностью."""

    event_id: uuid.UUID | None
    elapsed_min: int = Field(ge=1, le=600)


class WorkoutResultOut(BaseModel):
    """Строка «Результатов игроков» командного события для штаба (этап 2 плана)."""

    athlete_id: uuid.UUID
    name: str
    status: Literal["not_started", "in_progress", "finished"]
    session_id: uuid.UUID | None
    sets_done: int
    sets_total: int
    started_at: datetime | None
    finished_at: datetime | None
