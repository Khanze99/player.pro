"""Согласия на чувствительные данные (152-ФЗ, ст. 10).

Согласие даёт только сам игрок — ни тренер, ни врач, ни админ выдать его за него
не могут. Все изменения идут в аудит-лог.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.consent import DataConsent
from app.models.enums import ConsentAudience, ConsentScope
from app.services import audit_service

# Кому что видно: coach видит всё, что видит medic, но не наоборот.
_AUDIENCE_RANK: dict[ConsentAudience, int] = {
    ConsentAudience.none: 0,
    ConsentAudience.medic: 1,
    ConsentAudience.coach: 2,
}


async def get_active(db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope) -> DataConsent | None:
    """Активное согласие — то, у которого не проставлен revoked_at."""
    row = await db.execute(
        select(DataConsent)
        .where(
            DataConsent.athlete_id == athlete_id,
            DataConsent.scope == scope,
            DataConsent.revoked_at.is_(None),
        )
        .order_by(DataConsent.granted_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none()


async def audience_for(db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope) -> ConsentAudience:
    """Нет записи или версия текста устарела — считаем, что согласия нет."""
    consent = await get_active(db, athlete_id, scope)
    if consent is None:
        return ConsentAudience.none
    if consent.policy_version != settings.consent_policy_version:
        return ConsentAudience.none
    return ConsentAudience(consent.audience)


async def covers(
    db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope, required: ConsentAudience
) -> bool:
    granted = await audience_for(db, athlete_id, scope)
    return _AUDIENCE_RANK[granted] >= _AUDIENCE_RANK[required] > 0


async def _revoke_active(db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope) -> None:
    current = await get_active(db, athlete_id, scope)
    if current is not None:
        current.revoked_at = datetime.now(UTC)


async def grant(
    db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope, audience: ConsentAudience
) -> DataConsent | None:
    """Выдаёт согласие, закрывая предыдущее. audience=none означает отзыв."""
    if audience == ConsentAudience.none:
        await revoke(db, athlete_id, scope)
        return None

    await _revoke_active(db, athlete_id, scope)
    consent = DataConsent(
        athlete_id=athlete_id,
        scope=scope,
        audience=audience,
        policy_version=settings.consent_policy_version,
    )
    db.add(consent)
    await db.flush()
    audit_service.log(
        db,
        athlete_id,
        "consent.grant",
        "consent",
        consent.id,
        {"scope": scope.value, "audience": audience.value, "policy": consent.policy_version},
    )
    await db.commit()
    await db.refresh(consent)
    return consent


async def revoke(db: AsyncSession, athlete_id: uuid.UUID, scope: ConsentScope) -> None:
    """Отзыв не удаляет строку — история согласий обязана сохраняться."""
    current = await get_active(db, athlete_id, scope)
    if current is None:
        return
    current.revoked_at = datetime.now(UTC)
    audit_service.log(db, athlete_id, "consent.revoke", "consent", current.id, {"scope": scope.value})
    await db.commit()


async def my_consents(db: AsyncSession, athlete_id: uuid.UUID) -> dict[ConsentScope, ConsentAudience]:
    """Полная карта согласий игрока — для экрана приватности. Всегда все scope."""
    return {scope: await audience_for(db, athlete_id, scope) for scope in ConsentScope}
