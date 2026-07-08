import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import BodyRegion, BodySide


class PainPoint(Base):
    """Отметка боли на карте тела — деталь для medic/coach.

    НЕ влияет на Readiness (за боль в формуле отвечает единственный балл soreness).
    Привязана к записи wellness за конкретный день.
    """

    __tablename__ = "pain_points"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("wellness_entries.id"), index=True)
    region: Mapped[BodyRegion] = mapped_column(String(16))
    side: Mapped[BodySide] = mapped_column(String(8))
    severity: Mapped[int] = mapped_column()  # 1–10

    entry: Mapped["WellnessEntry"] = relationship(back_populates="pain_points")  # noqa: F821
