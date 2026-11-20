import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
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


class AvailabilityBaseline(Base):
    __tablename__ = "availability_baselines"

    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    start_date: Mapped[date_type]
    source: Mapped[str] = mapped_column(String(16), default="enrollment")
    version: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AvailabilityChange(Base):
    __tablename__ = "availability_changes"
    __table_args__ = (
        UniqueConstraint("athlete_id", "version", name="uq_availability_change_version"),
        CheckConstraint("direction IN ('medical', 'coaching')", name="chk_availability_direction"),
        CheckConstraint("status IN ('full', 'modified', 'unavailable')", name="chk_availability_status"),
        CheckConstraint(
            "source = 'legacy' OR (comment IS NOT NULL AND length(trim(comment)) BETWEEN 1 AND 1000)",
            name="chk_availability_comment",
        ),
        CheckConstraint(
            "medical_note IS NULL OR (direction = 'medical' AND length(medical_note) <= 2000)",
            name="chk_availability_medical_note",
        ),
        Index("ix_availability_direction_date", "athlete_id", "direction", "date", "version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    direction: Mapped[str] = mapped_column(String(16))
    date: Mapped[date_type]
    status: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    actor_role: Mapped[str] = mapped_column(String(16))
    comment: Mapped[str | None] = mapped_column(String(1000))
    medical_note: Mapped[str | None] = mapped_column(String(2000))
    source: Mapped[str] = mapped_column(String(16), default="manual")
    version: Mapped[int]
    request_id: Mapped[uuid.UUID] = mapped_column(unique=True)
    legacy_record_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("availability_records.id"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
