"""Тема организации для клиента.

Эндпоинт не принимает идентификатор организации: тема всегда своя. Иначе по чужому
id можно было бы перечислять организации.
"""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.branding import BrandingOut
from app.services import branding_service

router = APIRouter(prefix="/branding", tags=["branding"])


@router.get("", response_model=BrandingOut)
async def my_branding(user: CurrentUser, db: DbSession):
    return await branding_service.get_for_user(db, user)
