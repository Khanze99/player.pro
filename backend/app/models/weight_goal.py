"""Цель по весу (docs/plan-weight-tracking.md, «Дополнение: цель веса»).

Одна активная запись на игрока — ставит сам игрок, как nutrition_targets.
Спецкатегория body_metrics: та же видимость, что у веса/роста в профиле.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class WeightGoal(Base):
    __tablename__ = "weight_goals"
    __table_args__ = (
        CheckConstraint("start_weight_kg BETWEEN 30 AND 250", name="ck_weight_goal_start"),
        CheckConstraint("target_weight_kg BETWEEN 30 AND 250", name="ck_weight_goal_target"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # Снимок текущего известного веса на момент сохранения/правки цели — не
    # дата первой постановки. Повторная правка пересчитывает эту точку заново
    # (см. план: «точка отсчёта» — не исторический якорь, а «с сегодня»).
    start_weight_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    target_weight_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
