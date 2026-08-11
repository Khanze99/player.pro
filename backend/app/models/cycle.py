"""Менструальный цикл. Спецкатегория персданных (152-ФЗ, ст. 10).

Доступ — только через authz.ensure_can_view_sensitive(scope=cycle): роль сама по
себе прав не даёт, нужно согласие игрока. Записи создаёт исключительно сама
спортсменка — ни тренер, ни врач за неё отмечать не могут.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import Contraception, CycleSymptom, FlowIntensity


class CycleSettings(Base):
    __tablename__ = "cycle_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # Трекинг всегда включается вручную: наличие профиля не означает согласия вести его
    tracking_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    average_cycle_length: Mapped[int] = mapped_column(default=28)
    average_period_length: Mapped[int] = mapped_column(default=5)
    # Обязательное поле: подавляющие овуляцию методы делают расчёт фаз бессмысленным
    contraception: Mapped[Contraception] = mapped_column(String(24), default=Contraception.not_specified)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CycleLog(Base):
    """Одна запись на день. period_start — якорь, от него считается весь цикл."""

    __tablename__ = "cycle_logs"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_cycle_athlete_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    period_start: Mapped[bool] = mapped_column(Boolean, default=False)
    period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    flow: Mapped[FlowIntensity | None] = mapped_column(String(16), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    symptoms: Mapped[list["CycleSymptomLog"]] = relationship(
        back_populates="log", cascade="all, delete-orphan", lazy="selectin"
    )


class CycleSymptomLog(Base):
    """Симптом дня. Расшифровку видит только medic — тренеру уходит один флаг."""

    __tablename__ = "cycle_symptom_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    log_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cycle_logs.id"), index=True)
    symptom: Mapped[CycleSymptom] = mapped_column(String(24))
    severity: Mapped[int] = mapped_column()  # 1–10, как остальные шкалы проекта

    log: Mapped[CycleLog] = relationship(back_populates="symptoms")
