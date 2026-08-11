"""Дневник питания.

Строго личные данные: дневник видит только его владелец. Витрин для тренера и
врача нет — отображение штабу отложено как отдельное продуктовое решение.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import CustomFoodKind, FoodCategory, FoodSource, MealType


class FoodItem(Base):
    """Продукт. Все нутриенты — на 100 г, приведение к порции считает сервис."""

    __tablename__ = "food_items"
    __table_args__ = (
        Index("ix_food_items_barcode", "barcode"),
        Index("ix_food_items_name", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source: Mapped[FoodSource] = mapped_column(String(20), default=FoodSource.custom)
    barcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category: Mapped[FoodCategory] = mapped_column(String(16), default=FoodCategory.other)
    # Только для source=custom: почему продукта не было в справочнике.
    # Домашнюю еду в общий каталог не поднимают, новинку с рынка — стоит проверить.
    custom_kind: Mapped[CustomFoodKind | None] = mapped_column(String(16), nullable=True)

    kcal_100g: Mapped[float] = mapped_column(Float)
    protein_100g: Mapped[float] = mapped_column(Float, default=0)
    fat_100g: Mapped[float] = mapped_column(Float, default=0)
    carbs_100g: Mapped[float] = mapped_column(Float, default=0)
    fiber_100g: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Типичная порция — чтобы не заставлять взвешивать всё подряд
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Пользовательский продукт виден только автору; у общих справочников — NULL
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FoodLogEntry(Base):
    """Съеденное за день.

    Нутриенты снимаются снапшотом на момент записи: справочник может измениться
    (уточнили состав, поправили импорт), а история питания меняться от этого не должна.
    """

    __tablename__ = "food_log_entries"
    __table_args__ = (Index("ix_food_log_athlete_date", "athlete_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    meal: Mapped[MealType] = mapped_column(String(16))
    food_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("food_items.id"), nullable=True)

    # Снапшот на момент записи
    name: Mapped[str] = mapped_column(String(255))
    grams: Mapped[float] = mapped_column(Float)
    kcal: Mapped[float] = mapped_column(Float)
    protein: Mapped[float] = mapped_column(Float, default=0)
    fat: Mapped[float] = mapped_column(Float, default=0)
    carbs: Mapped[float] = mapped_column(Float, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NutritionTarget(Base):
    """Цели по калориям и БЖУ. Ставит сам пользователь."""

    __tablename__ = "nutrition_targets"

    # user_id — первичный ключ, отдельный unique поверх него не нужен
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    kcal: Mapped[int] = mapped_column()
    protein_g: Mapped[int | None] = mapped_column(nullable=True)
    fat_g: Mapped[int | None] = mapped_column(nullable=True)
    carbs_g: Mapped[int | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
