"""Фича-флаги для клиента.

Единственный источник правды — конфиг бэкенда. Приложение не решает само,
что показывать: иначе флаг пришлось бы синхронно выкатывать в сторы.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.config import settings

router = APIRouter(prefix="/features", tags=["features"])


class FeaturesOut(BaseModel):
    cycle: bool
    nutrition: bool


@router.get("", response_model=FeaturesOut)
async def features(user: CurrentUser):
    return FeaturesOut(
        cycle=settings.feature_cycle_enabled,
        nutrition=settings.feature_nutrition_enabled,
    )
