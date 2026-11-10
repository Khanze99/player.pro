import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import AttendanceStatus, EventType

if TYPE_CHECKING:
    from app.models.workout import Workout


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
    # План тренировки из шаблона (docs/plan-workout-builder.md), только у личного
    # события. SET NULL: удалили шаблон, событие и его RPE остаются без плана.
    workout_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workouts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # joined: EventOut отдаёт workout_name, и в async-сессии ленивая загрузка
    # упала бы при сериализации. У большинства событий шаблона нет, LEFT JOIN дешёвый.
    workout: Mapped["Workout | None"] = relationship(lazy="joined")

    @property
    def workout_name(self) -> str | None:
        return self.workout.name if self.workout is not None else None


class Attendance(Base):
    __tablename__ = "attendances"

    # ondelete=CASCADE: отметка посещаемости бессмысленна без события — удаление
    # события должно забирать её с собой, а не блокировать само удаление (баг:
    # FK без ondelete на любое событие с хоть одной отметкой кидал IntegrityError
    # на DELETE /events/{id}, 500 без обработки — для пользователя «не удаляется»).
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[AttendanceStatus] = mapped_column(String(16))
