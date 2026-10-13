import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DbSession
from app.services import exercise_service

router = APIRouter(prefix="/exercises", tags=["exercises"])


async def _exercise_or_404(db: DbSession, exercise_id: uuid.UUID):
    exercise = await exercise_service.get(db, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    return exercise


@router.get("/{exercise_id}/image")
async def exercise_image(exercise_id: uuid.UUID, user: CurrentUser, db: DbSession):
    exercise = await _exercise_or_404(db, exercise_id)
    path = exercise_service.image_path(exercise)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Картинка не загружена")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{exercise_id}/gif")
async def exercise_gif(exercise_id: uuid.UUID, user: CurrentUser, db: DbSession):
    exercise = await _exercise_or_404(db, exercise_id)
    path = exercise_service.gif_path(exercise)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GIF не загружен")
    return FileResponse(path, media_type="image/gif", headers={"Cache-Control": "public, max-age=86400"})
