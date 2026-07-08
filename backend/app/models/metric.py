import uuid
from datetime import date as date_type

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import StreakType


class DailyMetric(Base):
    """Денормализованный результат расчёта (ночной пересчёт + live-обновление)."""

    __tablename__ = "daily_metrics"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_metric_athlete_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    daily_load: Mapped[float] = mapped_column(Float, default=0)
    ewma_acute: Mapped[float | None] = mapped_column(Float, nullable=True)
    ewma_chronic: Mapped[float | None] = mapped_column(Float, nullable=True)
    acwr: Mapped[float | None] = mapped_column(Float, nullable=True)
    load_zone: Mapped[str] = mapped_column(String(16), default="no_data")
    readiness: Mapped[int | None] = mapped_column(nullable=True)
    readiness_zone: Mapped[str | None] = mapped_column(String(8), nullable=True)
    hr_flag: Mapped[bool] = mapped_column(default=False)
    unavailable_flag: Mapped[bool] = mapped_column(default=False)


class Streak(Base):
    __tablename__ = "streaks"
    __table_args__ = (UniqueConstraint("athlete_id", "type", name="uq_streak_athlete_type"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[StreakType] = mapped_column(String(16))
    count: Mapped[int] = mapped_column(default=0)
    last_date: Mapped[date_type | None] = mapped_column(nullable=True)
