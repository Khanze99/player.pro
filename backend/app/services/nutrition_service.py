"""Дневник питания (этап 2, docs/plan-women-health-nutrition.md).

Дневник видит только его владелец: витрин для тренера и врача здесь нет.
Нутриенты пишутся снапшотом — правка справочника не переписывает историю.
"""

import uuid
from datetime import date

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import FoodSource, MealType
from app.models.nutrition import FoodItem, FoodLogEntry, NutritionTarget
from app.schemas.nutrition import (
    FoodItemIn,
    FoodLogIn,
    FoodLogOut,
    MacroTotals,
    MealGroupOut,
    NutritionDayOut,
    NutritionTargetIn,
    NutritionTargetOut,
)

SEARCH_LIMIT = 30
RECENT_LIMIT = 20


# ------------------------------------------------------------------ справочник


def _visible_items(user_id: uuid.UUID):
    """Общий справочник + собственные продукты. Чужие custom не видны никогда."""
    return or_(FoodItem.created_by.is_(None), FoodItem.created_by == user_id)


# Импортированный слой Open Food Facts — краудсорс на десятки тысяч позиций:
# сорок вариантов «Coca-Cola» и названия вида «Молоко 3,2% 900мл (шт)». Без
# ранжирования он топит выверенный справочник, и запрос «овсянка» отдаёт брендовые
# упаковки вместо строки «Овсянка на воде». Порядок: выверенный набор, затем
# собственные продукты игрока, и только потом импорт.
_SOURCE_RANK = case(
    (FoodItem.source == FoodSource.curated, 0),
    (FoodItem.source == FoodSource.custom, 1),
    else_=2,
)


async def search_items(db: AsyncSession, user_id: uuid.UUID, query: str) -> list[FoodItem]:
    needle = query.strip().lower()
    pattern = f"%{needle}%"
    # Совпадение с начала названия — выше совпадения где-то в середине
    prefix_rank = case((func.lower(FoodItem.name).like(f"{needle}%"), 0), else_=1)
    rows = await db.execute(
        select(FoodItem)
        .where(
            _visible_items(user_id),
            or_(func.lower(FoodItem.name).like(pattern), func.lower(FoodItem.brand).like(pattern)),
        )
        .order_by(prefix_rank, _SOURCE_RANK, FoodItem.verified.desc(), FoodItem.name)
        .limit(SEARCH_LIMIT)
    )
    return list(rows.scalars())


async def find_by_barcode(db: AsyncSession, user_id: uuid.UUID, barcode: str) -> FoodItem | None:
    rows = await db.execute(
        select(FoodItem)
        .where(FoodItem.barcode == barcode.strip(), _visible_items(user_id))
        # Свой продукт с этим штрихкодом игрок завёл осознанно — он и выигрывает
        .order_by(FoodItem.created_by.is_(None), FoodItem.verified.desc())
        .limit(1)
    )
    return rows.scalar_one_or_none()


async def create_item(db: AsyncSession, user_id: uuid.UUID, data: FoodItemIn) -> FoodItem:
    item = FoodItem(source=FoodSource.custom, created_by=user_id, **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def recent_items(db: AsyncSession, user_id: uuid.UUID) -> list[FoodItem]:
    """Недавно съеденное — самый быстрый путь к повторному вводу."""
    recent_ids = await db.execute(
        select(FoodLogEntry.food_item_id, func.max(FoodLogEntry.created_at).label("last_used"))
        .where(FoodLogEntry.athlete_id == user_id, FoodLogEntry.food_item_id.is_not(None))
        .group_by(FoodLogEntry.food_item_id)
        .order_by(func.max(FoodLogEntry.created_at).desc())
        .limit(RECENT_LIMIT)
    )
    ids = [row[0] for row in recent_ids]
    if not ids:
        return []
    rows = await db.execute(select(FoodItem).where(FoodItem.id.in_(ids)))
    by_id = {item.id: item for item in rows.scalars()}
    return [by_id[i] for i in ids if i in by_id]


# ------------------------------------------------------------------ дневник


def _scale(value: float, grams: float) -> float:
    """Нутриенты хранятся на 100 г."""
    return round(value * grams / 100, 1)


async def add_entry(db: AsyncSession, athlete_id: uuid.UUID, data: FoodLogIn) -> FoodLogEntry:
    if data.food_item_id is not None:
        item = await db.get(FoodItem, data.food_item_id)
        if item is None:
            raise ValueError("Продукт не найден")
        entry = FoodLogEntry(
            athlete_id=athlete_id,
            date=data.date,
            meal=data.meal,
            food_item_id=item.id,
            name=item.name,
            grams=data.grams,
            kcal=_scale(item.kcal_100g, data.grams),
            protein=_scale(item.protein_100g, data.grams),
            fat=_scale(item.fat_100g, data.grams),
            carbs=_scale(item.carbs_100g, data.grams),
        )
    else:
        # Разовая запись: значения пришли уже на порцию, масштабировать не нужно
        entry = FoodLogEntry(
            athlete_id=athlete_id,
            date=data.date,
            meal=data.meal,
            name=data.name or "—",
            grams=data.grams,
            kcal=data.kcal or 0,
            protein=data.protein or 0,
            fat=data.fat or 0,
            carbs=data.carbs or 0,
        )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_entry(db: AsyncSession, athlete_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
    entry = await db.get(FoodLogEntry, entry_id)
    if entry is None or entry.athlete_id != athlete_id:
        return False
    await db.delete(entry)
    await db.commit()
    return True


async def _entries(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[FoodLogEntry]:
    rows = await db.execute(
        select(FoodLogEntry)
        .where(
            FoodLogEntry.athlete_id == athlete_id,
            FoodLogEntry.date >= date_from,
            FoodLogEntry.date <= date_to,
        )
        .order_by(FoodLogEntry.created_at)
    )
    return list(rows.scalars())


def _totals(entries: list[FoodLogEntry]) -> MacroTotals:
    return MacroTotals(
        kcal=round(sum(e.kcal for e in entries), 1),
        protein=round(sum(e.protein for e in entries), 1),
        fat=round(sum(e.fat for e in entries), 1),
        carbs=round(sum(e.carbs for e in entries), 1),
    )


async def get_day(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> NutritionDayOut:
    entries = await _entries(db, athlete_id, day, day)
    target = await get_target(db, athlete_id)

    meals = []
    for meal in MealType:
        meal_entries = [e for e in entries if e.meal == meal]
        meals.append(
            MealGroupOut(
                meal=meal,
                entries=[FoodLogOut.model_validate(e) for e in meal_entries],
                totals=_totals(meal_entries),
            )
        )

    return NutritionDayOut(
        date=day,
        totals=_totals(entries),
        target=NutritionTargetOut.model_validate(target) if target else None,
        meals=meals,
    )


async def copy_meal(
    db: AsyncSession, athlete_id: uuid.UUID, source_day: date, target_day: date, meal: MealType
) -> int:
    """«Повторить вчерашний завтрак» — главный ускоритель ввода."""
    source = await db.execute(
        select(FoodLogEntry).where(
            FoodLogEntry.athlete_id == athlete_id,
            FoodLogEntry.date == source_day,
            FoodLogEntry.meal == meal,
        )
    )
    copied = 0
    for entry in source.scalars():
        db.add(
            FoodLogEntry(
                athlete_id=athlete_id,
                date=target_day,
                meal=meal,
                food_item_id=entry.food_item_id,
                name=entry.name,
                grams=entry.grams,
                kcal=entry.kcal,
                protein=entry.protein,
                fat=entry.fat,
                carbs=entry.carbs,
            )
        )
        copied += 1
    await db.commit()
    return copied


# ------------------------------------------------------------------ цели


async def get_target(db: AsyncSession, user_id: uuid.UUID) -> NutritionTarget | None:
    return await db.get(NutritionTarget, user_id)


async def set_target(db: AsyncSession, user_id: uuid.UUID, data: NutritionTargetIn) -> NutritionTarget:
    target = await db.get(NutritionTarget, user_id)
    if target is None:
        target = NutritionTarget(user_id=user_id, kcal=data.kcal)
        db.add(target)
    for field, value in data.model_dump().items():
        setattr(target, field, value)
    await db.commit()
    await db.refresh(target)
    return target
