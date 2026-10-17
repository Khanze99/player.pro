"""Менструальный цикл. Спецкатегория персданных (152-ФЗ, ст. 10).

Доступ — только через authz.ensure_can_view_sensitive(scope=cycle): роль сама по
себе прав не даёт, нужно согласие игрока. Записи создаёт исключительно сама
спортсменка — ни тренер, ни врач за неё отмечать не могут.

Упрощено до минимума (решение 2026-10-16): только отметка дня и болевой порог.
Фазы цикла, прогноз, аменорея, детальные симптомы и контрацепция убраны из кода —
если понадобятся, возвращать отдельным решением, не восстанавливать по памяти.

Отдельного «включить трекинг» больше нет (решение 2026-10-17): трекинг всегда
доступен игроку-женщине, день либо отмечается, либо нет — включать нечего.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class CycleSettings(Base):
    __tablename__ = "cycle_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    average_cycle_length: Mapped[int] = mapped_column(default=28)
    average_period_length: Mapped[int] = mapped_column(default=5)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CycleLog(Base):
    """Одна запись на день: идут ли месячные и насколько болезненно."""

    __tablename__ = "cycle_logs"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_cycle_athlete_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    on_period: Mapped[bool] = mapped_column(Boolean, default=False)
    # Болевой порог (0-10, вербальная шкала) — тот же вопрос, что в утреннем опросе
    pain_level: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
