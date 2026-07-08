import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import AttendanceStatus, EventType


class Event(Base):
    """Командное событие (team_id задан) или индивидуальное (team_id = NULL, created_by = игрок)."""

    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    type: Mapped[EventType] = mapped_column(String(16))
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    planned_duration_min: Mapped[int] = mapped_column()
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Attendance(Base):
    __tablename__ = "attendances"

    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[AttendanceStatus] = mapped_column(String(16))
