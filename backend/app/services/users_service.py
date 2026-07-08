"""Профили пользователей и игроков."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AthleteProfile, User
from app.schemas.user import AthleteProfileIn, UserUpdateIn


async def update_me(db: AsyncSession, user: User, data: UserUpdateIn) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> AthleteProfile | None:
    return await db.get(AthleteProfile, user_id)


async def upsert_profile(db: AsyncSession, user_id: uuid.UUID, data: AthleteProfileIn) -> AthleteProfile:
    profile = await db.get(AthleteProfile, user_id)
    if profile is None:
        profile = AthleteProfile(user_id=user_id, **data.model_dump())
        db.add(profile)
    else:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile
