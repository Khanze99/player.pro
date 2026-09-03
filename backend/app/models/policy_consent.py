"""Юридический гейт согласий при регистрации (152-ФЗ, ст. 9 — ToS/ПДн,
ст. 10 — спецкатегория «здоровье»).

Другой примитив, чем `DataConsent` (app/models/consent.py): там —
гранулярное разрешение игрока показать тренеру/врачу цикл/питание/метрики
(scope × audience, отзываемо в любой момент). Здесь — бинарное «принял/не
принял» без audience, без которого пользователь не может пользоваться
приложением вообще. Смешивать в одной таблице нельзя.

Инварианты:
  · отсутствие записи = не согласился, «по умолчанию открыто» не бывает;
  · отзыв не удаляет строку, а проставляет revoked_at — история обязана сохраняться;
  · активное согласие по (user, kind) — ровно одно: revoked_at IS NULL.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import PolicyConsentKind


class PolicyConsent(Base):
    __tablename__ = "policy_consents"
    __table_args__ = (
        Index("ix_policy_consent_user_kind", "user_id", "kind"),
        Index("ix_policy_consent_active", "user_id", "kind", "revoked_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[PolicyConsentKind] = mapped_column(String(16))
    # Версия текста согласия на момент дачи — при смене текста согласие надо переспросить
    policy_version: Mapped[str] = mapped_column(String(32))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
