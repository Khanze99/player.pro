"""Согласия на обработку спецкатегорий персданных (152-ФЗ, ст. 10).

Эндпоинты сознательно только «про себя»: согласие даёт и отзывает исключительно
сам игрок. Возможности посмотреть чужие согласия нет ни у кого — иначе тренер
видел бы, кто отказался, и согласие перестало бы быть добровольным.
"""

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.models.enums import ConsentScope, PolicyConsentKind
from app.schemas.consent import ConsentListOut, ConsentOut, ConsentSetIn
from app.schemas.policy_consent import PolicyConsentListOut, PolicyConsentSetIn
from app.services import consent_service, policy_consent_service

router = APIRouter(prefix="/consents", tags=["consents"])


@router.get("/me", response_model=ConsentListOut)
async def my_consents(user: CurrentUser, db: DbSession):
    audiences = await consent_service.my_consents(db, user.id)
    consents = []
    for scope in ConsentScope:
        active = await consent_service.get_active(db, user.id, scope)
        consents.append(
            ConsentOut(
                scope=scope,
                audience=audiences[scope],
                policy_version=active.policy_version if active else None,
                granted_at=active.granted_at if active else None,
            )
        )
    return ConsentListOut(policy_version=settings.consent_policy_version, consents=consents)


@router.put("/me", response_model=ConsentOut)
async def set_consent(data: ConsentSetIn, user: CurrentUser, db: DbSession):
    await consent_service.grant(db, user.id, data.scope, data.audience)
    active = await consent_service.get_active(db, user.id, data.scope)
    return ConsentOut(
        scope=data.scope,
        audience=await consent_service.audience_for(db, user.id, data.scope),
        policy_version=active.policy_version if active else None,
        granted_at=active.granted_at if active else None,
    )


async def _policy_consent_status(db: DbSession, user_id: uuid.UUID) -> PolicyConsentListOut:
    statuses = await policy_consent_service.status_for(db, user_id)
    return PolicyConsentListOut(
        terms=statuses[PolicyConsentKind.terms],
        health_data=statuses[PolicyConsentKind.health_data],
    )


@router.get("/policy", response_model=PolicyConsentListOut)
async def my_policy_consents(user: CurrentUser, db: DbSession):
    """Юридический гейт при регистрации (152-ФЗ ст. 9/10) — не путать с /me
    выше (гранулярный sharing цикла/питания тренеру/врачу, другой примитив)."""
    return await _policy_consent_status(db, user.id)


@router.put("/policy", response_model=PolicyConsentListOut)
async def set_policy_consent(data: PolicyConsentSetIn, user: CurrentUser, db: DbSession):
    if data.granted:
        await policy_consent_service.grant(db, user.id, data.kind)
    else:
        await policy_consent_service.revoke(db, user.id, data.kind)
    return await _policy_consent_status(db, user.id)
