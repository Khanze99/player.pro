import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.models.enums import ConsentScope, Sex
from app.models.user import User
from app.schemas.auth import MeOut
from app.schemas.user import AthleteProfileIn, AthleteProfileOut, UserUpdateIn
from app.services import auth_service, avatar_service, users_service

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=MeOut)
async def update_me(data: UserUpdateIn, user: CurrentUser, db: DbSession):
    updated = await users_service.update_me(db, user, data)
    return await auth_service.build_me_out(db, updated)


@router.get("/me/profile", response_model=AthleteProfileOut)
async def my_profile(user: CurrentUser, db: DbSession):
    """Незаполненный профиль — нормальное состояние нового игрока, а не ошибка."""
    profile = await users_service.get_profile(db, user.id)
    if profile is None:
        return AthleteProfileOut(
            user_id=user.id,
            position=None,
            baseline_resting_hr=None,
            birthdate=None,
            sex=Sex.not_specified,
            height_cm=None,
            weight_kg=None,
        )
    return profile


@router.put("/me/profile", response_model=AthleteProfileOut)
async def upsert_my_profile(data: AthleteProfileIn, user: CurrentUser, db: DbSession):
    return await users_service.upsert_profile(db, user.id, data)


@router.put("/me/avatar", response_model=MeOut)
async def set_my_avatar(file: UploadFile, user: CurrentUser, db: DbSession):
    """Фото пересоздаётся сервером в квадрат WEBP без метадаты (EXIF/GPS)."""
    raw = await file.read()
    updated = await avatar_service.store(db, user, raw, file.content_type)
    return await auth_service.build_me_out(db, updated)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_avatar(user: CurrentUser, db: DbSession):
    await avatar_service.remove(db, user)


@router.get("/athletes/{athlete_id}/profile", response_model=AthleteProfileOut)
async def athlete_profile(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    profile = await users_service.get_profile(db, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не заполнен")

    out = AthleteProfileOut.model_validate(profile)
    # Рост/вес — спецкатегория body_metrics: без согласия игрока их не отдаём.
    # Тот же приём, что с медицинской детализацией в других витринах.
    if user.id != athlete_id:
        try:
            await authz.ensure_can_view_sensitive(db, user, athlete_id, ConsentScope.body_metrics)
        except HTTPException:
            out.height_cm = None
            out.weight_kg = None
    return out


@router.get("/{user_id}/avatar")
async def user_avatar(user_id: uuid.UUID, viewer: CurrentUser, db: DbSession):
    await authz.ensure_can_view_user_avatar(db, viewer, user_id)
    target = await db.get(User, user_id)
    path = avatar_service.file_path(target) if target else None
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Аватар не загружен")
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=86400"},
    )
