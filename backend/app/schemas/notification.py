import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import EventType, NotificationType


class NotificationAthleteOut(BaseModel):
    id: uuid.UUID
    name: str


class NotificationEventOut(BaseModel):
    # id = None у отменённого события: его уже нет, остался снимок из payload.
    id: uuid.UUID | None
    type: EventType
    title: str | None
    planned_start: datetime


class NotificationOut(BaseModel):
    id: uuid.UUID
    type: NotificationType
    created_at: datetime
    read_at: datetime | None
    team_id: uuid.UUID | None
    athlete: NotificationAthleteOut | None = None
    event: NotificationEventOut | None = None
    # Коды причин риска (те же, что в Squad Status): текст подставляет клиент.
    reasons: list[str] = []
    # availability_changed: новый статус доступности.
    status: str | None = None


class NotificationPageOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None


class UnreadCountOut(BaseModel):
    count: int
