"""Аккаунт целиком: удаление самим пользователем (docs/plan-legal-texts.md).

Без гейта `require_consented`: пользователь, который после выхода новой редакции
документов не принял их, должен иметь возможность удалиться прямо с экрана согласий
(«Не согласен, удалить аккаунт»), не соглашаясь.
"""

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.services import account_deletion_service

router = APIRouter(prefix="/account", tags=["account"])


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"description": "Единственный администратор организации с участниками"}},
)
async def delete_my_account(user: CurrentUser, db: DbSession) -> None:
    """Отзыв обоих согласий + необратимое удаление аккаунта и данных."""
    await account_deletion_service.delete_account(db, user)
