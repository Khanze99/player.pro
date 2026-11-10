"""Внутренние уведомления, «колокольчик» (docs/plan-notifications.md).

Текст на сервере не хранится: `type` и коды в `payload`, формулировку собирает
клиент через i18n. Медицинских подробностей (где болит, текст травмы) в payload
нет: только факт, детали открываются на экране игрока по обычным правилам authz.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import NotificationType


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # Идемпотентность триггеров: повторный пересчёт, ретрай задачи Celery или
        # два воркера сразу не создадут дубль (вставка через ON CONFLICT DO NOTHING).
        Index(
            "uq_notification_user_dedup",
            "user_id",
            "dedup_key",
            unique=True,
            postgresql_where=text("dedup_key IS NOT NULL"),
        ),
        Index("ix_notification_user_created", "user_id", text("created_at DESC")),
        Index("ix_notification_user_unread", "user_id", postgresql_where=text("read_at IS NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(String(64))
    # Команда, в контексте которой пришло уведомление: лента показывает его, только
    # пока получатель в ней состоит. NULL: личный режим и личные напоминания.
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    # О ком уведомление. Удаление аккаунта (надгробие) чистит по этой колонке явно,
    # см. account_deletion_service.OWNED; CASCADE на случай hard delete стенда.
    athlete_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    dedup_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
