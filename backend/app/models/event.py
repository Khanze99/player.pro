import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import AttendanceStatus, EventType

if TYPE_CHECKING:
    from app.models.workout import Workout


class Event(Base):
    """Командное событие (team_id задан) или индивидуальное (team_id = NULL, created_by = игрок)."""

    __tablename__ = "events"
    # У каждого события свой список: один план на два события дал бы общий список
    # и права по случайному из них (events_service._event_plan_id копирует, индекс
    # закрывает гонку двух параллельных запросов)
    __table_args__ = (
        Index(
            "uq_events_workout", "workout_id", unique=True, postgresql_where=text("workout_id IS NOT NULL")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    type: Mapped[EventType] = mapped_column(String(16))
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    planned_duration_min: Mapped[int] = mapped_column()
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    # Свой план упражнений (Workout с is_template=False, docs/plan-workout-builder.md),
    # у личного события и у командной тренировки. Шаблон сюда не ставится: при выборе копируется.
    workout_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workouts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # joined: EventOut отдаёт workout_name, и в async-сессии ленивая загрузка
    # упала бы при сериализации. У большинства событий шаблона нет, LEFT JOIN дешёвый.
    workout: Mapped["Workout | None"] = relationship(lazy="joined")

    # Кому назначены упражнения командного события (этап 2 docs/plan-workout-builder.md).
    # Пусто: всем игрокам команды. selectin: EventOut отдаёт список, в async-сессии
    # ленивая загрузка при сериализации упала бы.
    workout_athletes: Mapped[list["EventWorkoutAthlete"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def workout_name(self) -> str | None:
        return self.workout.name if self.workout is not None else None

    @property
    def workout_athlete_ids(self) -> list[uuid.UUID]:
        return [row.athlete_id for row in self.workout_athletes]


class EventWorkoutAthlete(Base):
    """Игрок, которому назначены упражнения командного события. Нет строк у
    события: упражнения у всех игроков команды."""

    __tablename__ = "event_workout_athletes"

    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    # CASCADE: полное удаление пользователя (scripts/delete_user.py) не блокируется
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class Attendance(Base):
    __tablename__ = "attendances"

    # ondelete=CASCADE: отметка посещаемости бессмысленна без события — удаление
    # события должно забирать её с собой, а не блокировать само удаление (баг:
    # FK без ondelete на любое событие с хоть одной отметкой кидал IntegrityError
    # на DELETE /events/{id}, 500 без обработки — для пользователя «не удаляется»).
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[AttendanceStatus] = mapped_column(String(16))
