import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import BodyRegion, InjuryType, SymptomType


class WellnessEntry(Base):
    """Ежедневный опрос самочувствия. 1 запись на игрока в день.

    ВНИМАНИЕ по данным: 5 wellness-шкал переведены с 1–5 на 1–10 (см. calculations.normalize_*).
    Alembic нет (create_all), это MVP dev-данные — существующие строки со шкалой 1–5 нужно
    просто удалить/пересоздать (тестовая БД пересоздаётся между тестами через drop_all/create_all).
    Отдельный миграционный фреймворк для этого сознательно не вводится.
    """

    __tablename__ = "wellness_entries"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_wellness_athlete_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    mood: Mapped[int] = mapped_column()  # 1–10, positive
    energy: Mapped[int] = mapped_column()  # 1–10, positive
    sleep_quality: Mapped[int] = mapped_column()  # 1–10, positive
    sleep_hours: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    stress: Mapped[int] = mapped_column()  # 1–10, обратная
    soreness: Mapped[int] = mapped_column()  # 1–10, обратная (единственный вход боли в Readiness)
    injury: Mapped[bool] = mapped_column(Boolean, default=False)
    injury_details: Mapped[str | None] = mapped_column(String(512), nullable=True)
    injury_area: Mapped[BodyRegion | None] = mapped_column(String(16), nullable=True)
    injury_type: Mapped[InjuryType | None] = mapped_column(String(16), nullable=True)
    symptom: Mapped[bool] = mapped_column(Boolean, default=False)
    symptom_details: Mapped[str | None] = mapped_column(String(512), nullable=True)
    symptom_type: Mapped[SymptomType | None] = mapped_column(String(16), nullable=True)
    resting_hr: Mapped[int | None] = mapped_column(nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Карта боли — детализация для medic/coach. НЕ влияет на Readiness (это делает soreness).
    pain_points: Mapped[list["PainPoint"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


from app.models.pain_point import PainPoint  # noqa: E402  — разрыв циклического импорта для relationship
