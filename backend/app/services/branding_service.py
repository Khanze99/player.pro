"""Брендинг организации (docs/plan-org-branding.md).

Тему готовим мы и кладём сидом (`scripts/seed_branding.py`); клиент только читает.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branding import OrganizationBranding
from app.models.organization import Organization
from app.models.user import User
from app.schemas.branding import DEFAULT_TOKENS, BrandingOut, ThemeTokens


async def get_for_user(db: AsyncSession, user: User) -> BrandingOut:
    """Тема организации пользователя; без организации или без темы — тема продукта.

    Ответ всегда одной формы: клиенту не приходится ветвиться.
    """
    if user.org_id is None:
        return BrandingOut(version=0, tokens=DEFAULT_TOKENS)

    org = await db.get(Organization, user.org_id)
    branding = await db.get(OrganizationBranding, user.org_id)
    if branding is None:
        return BrandingOut(
            version=0,
            org_id=user.org_id,
            org_name=org.name if org else None,
            tokens=DEFAULT_TOKENS,
        )
    return BrandingOut(
        version=branding.version,
        org_id=user.org_id,
        org_name=org.name if org else None,
        logo_url=branding.logo_url,
        tokens=ThemeTokens.model_validate(branding.tokens),
    )


async def set_branding(
    db: AsyncSession, org_id: uuid.UUID, tokens: ThemeTokens, logo_url: str | None = None
) -> OrganizationBranding:
    """Записать тему организации. Версия растёт, чтобы клиент перечитал тему."""
    branding = await db.get(OrganizationBranding, org_id)
    if branding is None:
        branding = OrganizationBranding(organization_id=org_id, version=1)
        db.add(branding)
    else:
        branding.version += 1
    branding.tokens = tokens.model_dump(mode="json")
    branding.logo_url = logo_url
    await db.commit()
    await db.refresh(branding)
    return branding
