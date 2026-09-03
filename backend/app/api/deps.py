from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.database import get_db
from app.models.enums import UserStatus
from app.models.user import User
from app.services import policy_consent_service

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не авторизован")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    user = await db.get(User, user_id)
    if user is None or user.status != UserStatus.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь неактивен")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_consented(user: CurrentUser, db: DbSession) -> User:
    """Юридический гейт онбординга (152-ФЗ ст. 9/10, docs/plan-onboarding-consent.md).

    Отдельно от `get_current_user`: тот отвечает только за валидный токен и
    активный статус, а не за завершённость онбординга.
    """
    if not await policy_consent_service.has_all(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется согласие на обработку персональных данных",
        )
    return user
