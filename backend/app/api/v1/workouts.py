"""Шаблоны тренировок (docs/plan-workout-builder.md). Только свои, чужое 404."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession, require_workouts_enabled
from app.core import authz
from app.schemas.workout import WorkoutIn, WorkoutOut, WorkoutShortOut
from app.services import workouts_service

router = APIRouter(prefix="/workouts", tags=["workouts"], dependencies=[Depends(require_workouts_enabled)])


@router.get("/me", response_model=list[WorkoutShortOut])
async def my_workouts(user: CurrentUser, db: DbSession):
    return await workouts_service.list_mine(db, user.id)


@router.post("", response_model=WorkoutOut, status_code=201)
async def create_workout(data: WorkoutIn, user: CurrentUser, db: DbSession):
    return await workouts_service.create(db, user.id, data)


@router.get("/{workout_id}", response_model=WorkoutOut)
async def get_workout(workout_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.require_workout_owner(db, user, workout_id)
    return workouts_service.to_out(await workouts_service.load(db, workout_id))


@router.put("/{workout_id}", response_model=WorkoutOut)
async def replace_workout(workout_id: uuid.UUID, data: WorkoutIn, user: CurrentUser, db: DbSession):
    workout = await authz.require_workout_owner(db, user, workout_id)
    return await workouts_service.replace(db, workout, data)


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(workout_id: uuid.UUID, user: CurrentUser, db: DbSession):
    workout = await authz.require_workout_owner(db, user, workout_id)
    await workouts_service.delete_workout(db, workout)
