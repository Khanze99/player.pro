import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.auth import MeOut
from app.schemas.user import AthleteProfileIn, AthleteProfileOut, UserUpdateIn
from app.services import users_service

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=MeOut)
async def update_me(data: UserUpdateIn, user: CurrentUser, db: DbSession):
    return await users_service.update_me(db, user, data)


@router.get("/me/profile", response_model=AthleteProfileOut)
async def my_profile(user: CurrentUser, db: DbSession):
    profile = await users_service.get_profile(db, user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не заполнен")
    return profile


@router.put("/me/profile", response_model=AthleteProfileOut)
async def upsert_my_profile(data: AthleteProfileIn, user: CurrentUser, db: DbSession):
    return await users_service.upsert_profile(db, user.id, data)


@router.get("/athletes/{athlete_id}/profile", response_model=AthleteProfileOut)
async def athlete_profile(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    profile = await users_service.get_profile(db, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль не заполнен")
    return profile
