"""Согласия на обработку спецкатегорий персданных (152-ФЗ, ст. 10).

Эндпоинты сознательно только «про себя»: согласие даёт и отзывает исключительно
сам игрок. Возможности посмотреть чужие согласия нет ни у кого — иначе тренер
видел бы, кто отказался, и согласие перестало бы быть добровольным.
"""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.models.enums import ConsentScope
from app.schemas.consent import ConsentListOut, ConsentOut, ConsentSetIn
from app.services import consent_service

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
