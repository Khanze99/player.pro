import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DbSession, require_workouts_enabled
from app.models.enums import ExerciseBodyPart
from app.schemas.exercise import (
    HISTORY_LIMIT_MAX,
    PAGE_LIMIT_DEFAULT,
    PAGE_LIMIT_MAX,
    SEARCH_MIN_LENGTH,
    ExerciseFacetsOut,
    ExerciseHistoryOut,
    ExerciseOut,
    ExercisePage,
)
from app.services import exercise_service, workout_sessions_service

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.get("", response_model=ExercisePage)
async def search_exercises(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(default=None, min_length=SEARCH_MIN_LENGTH, max_length=100),
    body_part: ExerciseBodyPart | None = None,
    equipment: str | None = Query(default=None, max_length=64),
    lang: Literal["ru", "en", "es"] = "ru",
    limit: int = Query(default=PAGE_LIMIT_DEFAULT, ge=1, le=PAGE_LIMIT_MAX),
    offset: int = Query(default=0, ge=0),
):
    return await exercise_service.search(
        db, q=q, body_part=body_part, equipment=equipment, lang=lang, limit=limit, offset=offset
    )


@router.get("/facets", response_model=ExerciseFacetsOut)
async def exercise_facets(user: CurrentUser, db: DbSession):
    return await exercise_service.facets(db)


@router.get("/{exercise_id}", response_model=ExerciseOut)
async def exercise_card(exercise_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return await exercise_service.get_or_404(db, exercise_id)


@router.get(
    "/{exercise_id}/history",
    response_model=list[ExerciseHistoryOut],
    dependencies=[Depends(require_workouts_enabled)],
)
async def exercise_history(
    exercise_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=10, ge=1, le=HISTORY_LIMIT_MAX),
):
    """Мои прошлые подходы в этом упражнении. Часть конструктора, поэтому под флагом."""
    await exercise_service.get_or_404(db, exercise_id)
    return await workout_sessions_service.exercise_history(db, user.id, exercise_id, limit)


@router.get("/{exercise_id}/image")
async def exercise_image(exercise_id: uuid.UUID, user: CurrentUser, db: DbSession):
    exercise = await exercise_service.get_or_404(db, exercise_id)
    path = exercise_service.image_path(exercise)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Картинка не загружена")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{exercise_id}/gif")
async def exercise_gif(exercise_id: uuid.UUID, user: CurrentUser, db: DbSession):
    exercise = await exercise_service.get_or_404(db, exercise_id)
    path = exercise_service.gif_path(exercise)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GIF не загружен")
    return FileResponse(path, media_type="image/gif", headers={"Cache-Control": "public, max-age=86400"})
