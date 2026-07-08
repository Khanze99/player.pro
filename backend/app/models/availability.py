import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import AvailabilityStatus


class AvailabilityRecord(Base):
    __tablename__ = "availability_records"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_availability_athlete_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date_type] = mapped_column(index=True)
    status: Mapped[AvailabilityStatus] = mapped_column(String(16))
    set_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
