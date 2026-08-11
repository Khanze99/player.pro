"""Дневник питания.

Строго личный: и запись, и чтение — только своё. Эндпоинтов для тренера и врача
нет намеренно, отображение штабу — отдельное решение на потом.
"""

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession
from app.models.enums import MealType
from app.schemas.nutrition import (
    FoodItemIn,
    FoodItemOut,
    FoodLogIn,
    FoodLogOut,
    NutritionDayOut,
    NutritionTargetIn,
    NutritionTargetOut,
)
from app.services import nutrition_service

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


# ------------------------------------------------------------------ справочник


@router.get("/foods/search", response_model=list[FoodItemOut])
async def search_foods(user: CurrentUser, db: DbSession, q: str = Query(min_length=2)):
    return await nutrition_service.search_items(db, user.id, q)


@router.get("/foods/barcode/{barcode}", response_model=FoodItemOut)
async def food_by_barcode(barcode: str, user: CurrentUser, db: DbSession):
    item = await nutrition_service.find_by_barcode(db, user.id, barcode)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Продукт не найден")
    return item


@router.get("/foods/recent", response_model=list[FoodItemOut])
async def recent_foods(user: CurrentUser, db: DbSession):
    return await nutrition_service.recent_items(db, user.id)


@router.post("/foods", response_model=FoodItemOut, status_code=201)
async def create_food(data: FoodItemIn, user: CurrentUser, db: DbSession):
    return await nutrition_service.create_item(db, user.id, data)


# ------------------------------------------------------------------ дневник


@router.get("/me/day", response_model=NutritionDayOut)
async def my_day(user: CurrentUser, db: DbSession, day: date | None = None):
    return await nutrition_service.get_day(db, user.id, day or date.today())


@router.post("/me/entries", response_model=FoodLogOut, status_code=201)
async def add_entry(data: FoodLogIn, user: CurrentUser, db: DbSession):
    try:
        return await nutrition_service.add_entry(db, user.id, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/me/entries/{entry_id}", status_code=204)
async def delete_entry(entry_id: uuid.UUID, user: CurrentUser, db: DbSession):
    if not await nutrition_service.delete_entry(db, user.id, entry_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена")


@router.post("/me/copy-meal", status_code=200)
async def copy_meal(user: CurrentUser, db: DbSession, source_day: date, target_day: date, meal: MealType):
    copied = await nutrition_service.copy_meal(db, user.id, source_day, target_day, meal)
    return {"copied": copied}


# ------------------------------------------------------------------ цели


@router.get("/me/target", response_model=NutritionTargetOut | None)
async def my_target(user: CurrentUser, db: DbSession):
    return await nutrition_service.get_target(db, user.id)


@router.put("/me/target", response_model=NutritionTargetOut)
async def set_target(data: NutritionTargetIn, user: CurrentUser, db: DbSession):
    return await nutrition_service.set_target(db, user.id, data)
