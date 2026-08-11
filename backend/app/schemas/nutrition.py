import uuid
from datetime import date as date_type

from pydantic import BaseModel, Field

from app.models.enums import CustomFoodKind, FoodCategory, FoodSource, MealType

MAX_TARGET_KCAL = 8000


class FoodItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: FoodCategory = FoodCategory.other
    custom_kind: CustomFoodKind = CustomFoodKind.homemade
    brand: str | None = Field(default=None, max_length=128)
    barcode: str | None = Field(default=None, max_length=32)
    kcal_100g: float = Field(ge=0, le=900)
    protein_100g: float = Field(default=0, ge=0, le=100)
    fat_100g: float = Field(default=0, ge=0, le=100)
    carbs_100g: float = Field(default=0, ge=0, le=100)
    fiber_100g: float | None = Field(default=None, ge=0, le=100)
    serving_size_g: float | None = Field(default=None, gt=0, le=5000)
    serving_name: str | None = Field(default=None, max_length=64)


class FoodItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    source: FoodSource
    barcode: str | None
    name: str
    brand: str | None
    category: FoodCategory
    custom_kind: CustomFoodKind | None
    kcal_100g: float
    protein_100g: float
    fat_100g: float
    carbs_100g: float
    fiber_100g: float | None
    serving_size_g: float | None
    serving_name: str | None
    verified: bool


class FoodLogIn(BaseModel):
    date: date_type
    meal: MealType
    food_item_id: uuid.UUID | None = None
    grams: float = Field(gt=0, le=5000)
    # Разовая запись без продукта в справочнике («съел в столовой»)
    name: str | None = Field(default=None, max_length=255)
    kcal: float | None = Field(default=None, ge=0, le=10000)
    protein: float | None = Field(default=None, ge=0)
    fat: float | None = Field(default=None, ge=0)
    carbs: float | None = Field(default=None, ge=0)


class FoodLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    date: date_type
    meal: MealType
    food_item_id: uuid.UUID | None
    name: str
    grams: float
    kcal: float
    protein: float
    fat: float
    carbs: float


class MacroTotals(BaseModel):
    kcal: float
    protein: float
    fat: float
    carbs: float


class MealGroupOut(BaseModel):
    meal: MealType
    entries: list[FoodLogOut]
    totals: MacroTotals


class NutritionDayOut(BaseModel):
    date: date_type
    totals: MacroTotals
    target: "NutritionTargetOut | None"
    meals: list[MealGroupOut]


class NutritionTargetIn(BaseModel):
    kcal: int = Field(gt=0, le=MAX_TARGET_KCAL)
    protein_g: int | None = Field(default=None, ge=0, le=500)
    fat_g: int | None = Field(default=None, ge=0, le=400)
    carbs_g: int | None = Field(default=None, ge=0, le=1200)


class NutritionTargetOut(BaseModel):
    model_config = {"from_attributes": True}

    kcal: int
    protein_g: int | None
    fat_g: int | None
    carbs_g: int | None


# Витрин для штаба здесь нет намеренно: дневник видит только его владелец.
# Отображение тренеру/врачу — отдельное продуктовое решение, вернёмся к нему позже.

NutritionDayOut.model_rebuild()
