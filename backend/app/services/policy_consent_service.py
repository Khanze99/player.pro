"""Юридический гейт согласий при регистрации (152-ФЗ, ст. 9 — ToS/ПДн,
ст. 10 — спецкатегория «здоровье»).

Другой примитив, чем `DataConsent`/`consent_service.py` — см. docstring
`app/models/policy_consent.py`. Согласие даёт только сам пользователь, каждое
изменение — в аудит-лог.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import PolicyConsentKind
from app.models.policy_consent import PolicyConsent
from app.schemas.policy_consent import PolicyConsentStatusOut
from app.services import audit_service


def _current_version(kind: PolicyConsentKind) -> str:
    if kind is PolicyConsentKind.terms:
        return settings.terms_policy_version
    return settings.health_consent_policy_version


async def get_active(db: AsyncSession, user_id: uuid.UUID, kind: PolicyConsentKind) -> PolicyConsent | None:
    """Активное согласие — то, у которого не проставлен revoked_at."""
    row = await db.execute(
        select(PolicyConsent)
        .where(
            PolicyConsent.user_id == user_id,
            PolicyConsent.kind == kind,
            PolicyConsent.revoked_at.is_(None),
        )
        .order_by(PolicyConsent.granted_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none()


def _is_current(consent: PolicyConsent | None, kind: PolicyConsentKind) -> bool:
    """Нет записи или версия текста устарела — считаем, что согласия нет."""
    return consent is not None and consent.policy_version == _current_version(kind)


async def status_for(db: AsyncSession, user_id: uuid.UUID) -> dict[PolicyConsentKind, PolicyConsentStatusOut]:
    """Статус согласия по каждому kind — для GET /consents/policy и MeOut."""
    statuses: dict[PolicyConsentKind, PolicyConsentStatusOut] = {}
    for kind in PolicyConsentKind:
        active = await get_active(db, user_id, kind)
        statuses[kind] = PolicyConsentStatusOut(
            granted=_is_current(active, kind),
            policy_version=active.policy_version if active else None,
            granted_at=active.granted_at if active else None,
        )
    return statuses


async def has_all(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Есть ли активное согласие актуальной версии по обоим kind — серверный
    гейт онбординга (`require_consented`)."""
    statuses = await status_for(db, user_id)
    return all(status.granted for status in statuses.values())


async def _revoke_active(db: AsyncSession, user_id: uuid.UUID, kind: PolicyConsentKind) -> None:
    current = await get_active(db, user_id, kind)
    if current is not None:
        current.revoked_at = datetime.now(UTC)


async def grant(db: AsyncSession, user_id: uuid.UUID, kind: PolicyConsentKind) -> PolicyConsent:
    """Выдаёт согласие текущей версии текста, закрывая предыдущее (если было)."""
    await _revoke_active(db, user_id, kind)
    consent = PolicyConsent(user_id=user_id, kind=kind, policy_version=_current_version(kind))
    db.add(consent)
    await db.flush()
    audit_service.log(
        db,
        user_id,
        "policy_consent.grant",
        "policy_consent",
        consent.id,
        {"kind": kind.value, "policy_version": consent.policy_version},
    )
    await db.commit()
    await db.refresh(consent)
    return consent


async def revoke(db: AsyncSession, user_id: uuid.UUID, kind: PolicyConsentKind) -> None:
    """Отзыв не удаляет строку — история согласий обязана сохраняться."""
    current = await get_active(db, user_id, kind)
    if current is None:
        return
    current.revoked_at = datetime.now(UTC)
    audit_service.log(
        db, user_id, "policy_consent.revoke", "policy_consent", current.id, {"kind": kind.value}
    )
    await db.commit()
