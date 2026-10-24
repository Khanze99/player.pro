"""Профили пользователей и игроков."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Sex
from app.models.user import AthleteProfile, User
from app.models.weight_goal import WeightGoal
from app.schemas.user import AthleteProfileIn, UserUpdateIn, WeightGoalIn

NAME_PARTS = ("last_name", "first_name", "middle_name")


def split_full_name(value: str) -> tuple[str, str, str]:
    """Разбирает строку «Фамилия Имя Отчество» в три части (хвост уходит в отчество).

    Нужно только для данных, пришедших одной строкой (имя из приглашения).
    """
    parts = value.split()
    last = parts[0] if parts else ""
    first = parts[1] if len(parts) > 1 else ""
    middle = " ".join(parts[2:])
    return last, first, middle


async def update_me(db: AsyncSession, user: User, data: UserUpdateIn) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, (value or "").strip() if field in NAME_PARTS else value)
    await db.commit()
    await db.refresh(user)
    return user


async def get_profile(db: AsyncSession, user_id: uuid.UUID) -> AthleteProfile | None:
    return await db.get(AthleteProfile, user_id)


async def upsert_profile(db: AsyncSession, user_id: uuid.UUID, data: AthleteProfileIn) -> AthleteProfile:
    profile = await db.get(AthleteProfile, user_id)
    changes = data.model_dump(exclude_unset=True)
    # sex не nullable: явный null трактуем как «не указано», а не как затирание дефолта
    if changes.get("sex", "sentinel") is None:
        changes["sex"] = Sex.not_specified

    if profile is None:
        # exclude_unset, иначе непереданные поля пришли бы как None и затёрли дефолты колонок
        profile = AthleteProfile(user_id=user_id, **changes)
        db.add(profile)
    else:
        for field, value in changes.items():
            setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_weight_goal(db: AsyncSession, user_id: uuid.UUID) -> WeightGoal | None:
    return await db.get(WeightGoal, user_id)


async def set_weight_goal(db: AsyncSession, user_id: uuid.UUID, data: WeightGoalIn) -> WeightGoal:
    """start_weight_kg — не от клиента: снимок текущего известного веса на
    момент сохранения (см. docs/plan-weight-tracking.md, «точка отсчёта»
    пересчитывается при каждой правке, не хранит историю первой постановки).
    """
    profile = await db.get(AthleteProfile, user_id)
    if profile is None or profile.weight_kg is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала отметь вес хотя бы раз — иначе не от чего отталкивать цель",
        )

    goal = await db.get(WeightGoal, user_id)
    if goal is None:
        goal = WeightGoal(
            user_id=user_id,
            start_weight_kg=profile.weight_kg,
            target_weight_kg=data.target_weight_kg,
        )
        db.add(goal)
    else:
        goal.start_weight_kg = profile.weight_kg
        goal.target_weight_kg = data.target_weight_kg
    await db.commit()
    await db.refresh(goal)
    return goal
