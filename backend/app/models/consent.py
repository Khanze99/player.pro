"""Согласия на чувствительные данные (152-ФЗ, ст. 10 — специальные категории).

Инварианты:
  · отсутствие записи = запрет, «по умолчанию открыто» не бывает;
  · отзыв не удаляет строку, а проставляет revoked_at — история обязана сохраняться;
  · активное согласие по (athlete, scope) — ровно одно: revoked_at IS NULL.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import ConsentAudience, ConsentScope


class DataConsent(Base):
    __tablename__ = "data_consents"
    __table_args__ = (
        Index("ix_consent_athlete_scope", "athlete_id", "scope"),
        Index("ix_consent_active", "athlete_id", "scope", "revoked_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    scope: Mapped[ConsentScope] = mapped_column(String(16))
    audience: Mapped[ConsentAudience] = mapped_column(String(8))
    # Версия текста согласия на момент дачи — при смене текста согласие надо переспросить
    policy_version: Mapped[str] = mapped_column(String(32))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
