"""Колокольчик (docs/plan-notifications.md): лента и счётчик текущего пользователя."""

import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import NotificationPageOut, UnreadCountOut
from app.services import notifications_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPageOut)
async def list_notifications(
    user: CurrentUser,
    db: DbSession,
    cursor: str | None = None,
    limit: int = Query(default=30, ge=1, le=50),
):
    return await notifications_service.list_page(db, user.id, cursor, limit)


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(user: CurrentUser, db: DbSession):
    return UnreadCountOut(count=await notifications_service.unread_count(db, user.id))


@router.post("/read-all", status_code=204)
async def read_all(user: CurrentUser, db: DbSession):
    await notifications_service.mark_all_read(db, user.id)


@router.post("/{notification_id}/read", status_code=204)
async def read_one(notification_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await notifications_service.mark_read(db, user.id, notification_id)
