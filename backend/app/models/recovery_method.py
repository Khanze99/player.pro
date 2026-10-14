import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import RecoveryMethod


class RecoveryMethodLog(Base):
    """Отметка восстановительной процедуры (массаж/компрессия/крио/физио) за вчера —
    деталь для medic/coach, на Readiness не влияет. Привязана к записи wellness.
    """

    __tablename__ = "recovery_method_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("wellness_entries.id"), index=True)
    method: Mapped[RecoveryMethod] = mapped_column(String(20))

    entry: Mapped["WellnessEntry"] = relationship(back_populates="recovery_methods")  # noqa: F821
