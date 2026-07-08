import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import InjurySeverity, InjuryStatus


class InjuryRecord(Base):
    __tablename__ = "injury_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(128))
    location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    severity: Mapped[InjurySeverity] = mapped_column(String(16))
    start_date: Mapped[date] = mapped_column()
    end_date: Mapped[date | None] = mapped_column(nullable=True)
    status: Mapped[InjuryStatus] = mapped_column(String(16), default=InjuryStatus.active)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
