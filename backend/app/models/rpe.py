import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class RpeEntry(Base):
    __tablename__ = "rpe_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), nullable=True)
    date: Mapped[date_type] = mapped_column(index=True)
    exertion: Mapped[int] = mapped_column()  # RPE CR10, 1–10
    performance: Mapped[int] = mapped_column()  # 1–5
    duration_min: Mapped[int] = mapped_column()
    session_load: Mapped[int] = mapped_column()  # exertion × duration_min
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
