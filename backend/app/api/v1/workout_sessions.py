"""Выполнение тренировки (docs/plan-workout-builder.md). Только свои, чужое 404."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, DbSession, require_workouts_enabled
from app.core import authz
from app.schemas.workout import (
    SessionSetsIn,
    WorkoutSessionFinishOut,
    WorkoutSessionOut,
    WorkoutSessionShortOut,
    WorkoutSessionStartIn,
)
from app.services import workout_sessions_service

router = APIRouter(
    prefix="/workout-sessions", tags=["workouts"], dependencies=[Depends(require_workouts_enabled)]
)


@router.post("", response_model=WorkoutSessionOut, status_code=201)
async def start_session(data: WorkoutSessionStartIn, user: CurrentUser, db: DbSession):
    workout = None
    if data.workout_id is not None:
        workout = await authz.require_workout_owner(db, user, data.workout_id)
    session_id = await workout_sessions_service.start(db, user, data, workout)
    return await workout_sessions_service.build_out(db, session_id)


@router.get("/active", response_model=WorkoutSessionOut, responses={204: {"description": "Активной нет"}})
async def active_session(user: CurrentUser, db: DbSession):
    session_id = await workout_sessions_service.active_session_id(db, user.id)
    if session_id is None:
        return Response(status_code=204)
    return await workout_sessions_service.build_out(db, session_id)


@router.get("/me", response_model=list[WorkoutSessionShortOut])
async def my_sessions(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=90)
    return await workout_sessions_service.list_mine(db, user.id, date_from, date_to)


@router.get("/{session_id}", response_model=WorkoutSessionOut)
async def get_session(session_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.require_session_owner(db, user, session_id)
    return await workout_sessions_service.build_out(db, session_id)


@router.put("/{session_id}/sets", response_model=WorkoutSessionOut)
async def replace_sets(session_id: uuid.UUID, data: SessionSetsIn, user: CurrentUser, db: DbSession):
    session = await authz.require_session_owner(db, user, session_id)
    return await workout_sessions_service.replace_sets(db, session, data)


@router.post("/{session_id}/finish", response_model=WorkoutSessionFinishOut)
async def finish_session(session_id: uuid.UUID, user: CurrentUser, db: DbSession):
    session = await authz.require_session_owner(db, user, session_id)
    return await workout_sessions_service.finish(db, session)


@router.delete("/{session_id}", status_code=204)
async def discard_session(session_id: uuid.UUID, user: CurrentUser, db: DbSession):
    session = await authz.require_session_owner(db, user, session_id)
    await workout_sessions_service.discard(db, session)
