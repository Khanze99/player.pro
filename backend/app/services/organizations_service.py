"""Организации: создание, приглашения (раздел 2.3, 3.4 ТЗ)."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import GlobalRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import OrganizationCreateIn


async def create_organization(db: AsyncSession, creator: User, data: OrganizationCreateIn) -> Organization:
    """Создатель без организации становится её админом."""
    if creator.org_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Вы уже состоите в организации")
    org = Organization(name=data.name, timezone=data.timezone, locale=data.locale)
    db.add(org)
    await db.flush()
    creator.org_id = org.id
    creator.global_role = GlobalRole.admin
    await db.commit()
    await db.refresh(org)
    return org


async def get_my_organization(db: AsyncSession, user: User) -> Organization:
    if user.org_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Вы не состоите в организации")
    org = await db.get(Organization, user.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")
    return org
