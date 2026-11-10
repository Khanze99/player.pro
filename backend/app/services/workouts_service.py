"""Шаблоны тренировок (docs/plan-workout-builder.md).

Что шаблон принадлежит пользователю, проверяет роут (authz.require_workout_owner);
сюда приходит уже свой шаблон.
"""

import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import WorkoutItemMode
from app.models.workout import Workout, WorkoutItem
from app.schemas.workout import (
    MAX_WORKOUTS_PER_USER,
    WorkoutIn,
    WorkoutItemOut,
    WorkoutOut,
    WorkoutShortOut,
)
from app.services import exercise_service

# Оценка длительности для события по умолчанию: одно повторение ~3 с, без
# заданного отдыха считаем минуту между подходами, разминку не учитываем.
SECONDS_PER_REP = 3
DEFAULT_REST_SEC = 60
ROUND_TO_MIN = 5
MAX_EST_MIN = 600  # потолок planned_duration_min у события


def estimate_duration_min(items: list[WorkoutItem]) -> int:
    """Подходы × (повторы × 3 с или заданное время) + отдых, вверх до 5 минут."""
    total_sec = 0
    for item in items:
        work = (
            (item.reps or 0) * SECONDS_PER_REP
            if item.mode == WorkoutItemMode.reps
            else item.duration_sec or 0
        )
        rest = item.rest_sec if item.rest_sec is not None else DEFAULT_REST_SEC
        total_sec += item.sets * (work + rest)
    minutes = math.ceil(total_sec / 60 / ROUND_TO_MIN) * ROUND_TO_MIN
    return min(max(minutes, ROUND_TO_MIN), MAX_EST_MIN)


def _with_items():
    return selectinload(Workout.items)


async def load(db: AsyncSession, workout_id: uuid.UUID) -> Workout:
    row = await db.scalar(
        select(Workout)
        .where(Workout.id == workout_id)
        .options(_with_items())
        .execution_options(populate_existing=True)
    )
    if row is None:  # роут уже проверил владельца, сюда не попадаем
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    return row


def to_out(workout: Workout) -> WorkoutOut:
    return WorkoutOut(
        id=workout.id,
        name=workout.name,
        notes=workout.notes,
        items=[WorkoutItemOut.model_validate(item) for item in workout.items],
        est_duration_min=estimate_duration_min(workout.items),
        created_at=workout.created_at,
        updated_at=workout.updated_at,
    )


async def list_mine(db: AsyncSession, owner_id: uuid.UUID) -> list[WorkoutShortOut]:
    rows = await db.scalars(
        select(Workout)
        .where(Workout.owner_id == owner_id)
        .options(_with_items())
        .order_by(Workout.updated_at.desc())
    )
    return [
        WorkoutShortOut(
            id=w.id,
            name=w.name,
            items_count=len(w.items),
            est_duration_min=estimate_duration_min(w.items),
            updated_at=w.updated_at,
        )
        for w in rows
    ]


def _items_from(data: WorkoutIn) -> list[WorkoutItem]:
    return [
        WorkoutItem(
            position=position,
            exercise_id=item.exercise_id,
            mode=item.mode,
            sets=item.sets,
            reps=item.reps,
            weight_kg=item.weight_kg,
            duration_sec=item.duration_sec,
            rest_sec=item.rest_sec,
            notes=item.notes,
        )
        for position, item in enumerate(data.items)
    ]


async def create(db: AsyncSession, owner_id: uuid.UUID, data: WorkoutIn) -> WorkoutOut:
    count = await db.scalar(select(func.count()).select_from(Workout).where(Workout.owner_id == owner_id))
    if (count or 0) >= MAX_WORKOUTS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Можно сохранить не больше {MAX_WORKOUTS_PER_USER} тренировок",
        )
    await exercise_service.ensure_exist(db, {item.exercise_id for item in data.items})
    workout = Workout(owner_id=owner_id, name=data.name, notes=data.notes)
    workout.items = _items_from(data)
    db.add(workout)
    await db.commit()
    return to_out(await load(db, workout.id))


async def replace(db: AsyncSession, workout: Workout, data: WorkoutIn) -> WorkoutOut:
    """PUT: шаблон целиком. Пункты удаляются и вставляются заново в одной транзакции."""
    await exercise_service.ensure_exist(db, {item.exercise_id for item in data.items})
    await db.execute(delete(WorkoutItem).where(WorkoutItem.workout_id == workout.id))
    workout.name = data.name
    workout.notes = data.notes
    # onupdate не сработает, если имя и заметка не поменялись, а поменялись только пункты
    workout.updated_at = func.now()
    for item in _items_from(data):
        item.workout_id = workout.id
        db.add(item)
    await db.commit()
    return to_out(await load(db, workout.id))


async def delete_workout(db: AsyncSession, workout: Workout) -> None:
    """События и история остаются: у них workout_id станет NULL (ON DELETE SET NULL)."""
    await db.delete(workout)
    await db.commit()
