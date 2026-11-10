"""Конструктор тренировок в личном режиме (docs/plan-workout-builder.md).

Строго личные данные: шаблоны и выполнения видит только владелец, витрин для
штаба нет. На метрики не влияет: нагрузка по-прежнему только через RPE.

Шаблон живой: событие ссылается на него (Event.workout_id), правка шаблона
меняет план будущих событий. Выполнение хранит подходы снапшотом и от правок
шаблона не меняется, как FoodLogEntry в дневнике питания.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import WorkoutItemMode
from app.models.exercise import Exercise


class Workout(Base):
    """Шаблон тренировки."""

    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["WorkoutItem"]] = relationship(
        back_populates="workout",
        order_by="WorkoutItem.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class WorkoutItem(Base):
    """Упражнение в шаблоне. Цель одинакова для всех подходов (3 × 10 × 40 кг)."""

    __tablename__ = "workout_items"
    # Правка шаблона заменяет список целиком (удалить и вставить в одной
    # транзакции), поэтому отложенная проверка уникальности не нужна.
    __table_args__ = (UniqueConstraint("workout_id", "position", name="uq_workout_items_position"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workout_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    # Справочник не удаляется, поэтому без ondelete (RESTRICT по умолчанию)
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"), index=True)
    mode: Mapped[WorkoutItemMode] = mapped_column(String(8))
    sets: Mapped[int] = mapped_column(SmallInteger)
    reps: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(nullable=True)
    rest_sec: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    workout: Mapped[Workout] = relationship(back_populates="items")
    exercise: Mapped[Exercise] = relationship(lazy="joined")


class WorkoutSession(Base):
    """Факт выполнения тренировки. finished_at IS NULL: тренировка идёт."""

    __tablename__ = "workout_sessions"
    __table_args__ = (
        Index("ix_workout_sessions_athlete_date", "athlete_id", "date"),
        # Одна незавершённая тренировка на человека: вторая отвечает 409
        # с id активной (code=active_session).
        Index(
            "uq_workout_sessions_active",
            "athlete_id",
            unique=True,
            postgresql_where=text("finished_at IS NULL"),
        ),
        # Одно выполнение на событие, как uq_rpe_athlete_event.
        Index(
            "uq_workout_sessions_event",
            "event_id",
            unique=True,
            postgresql_where=text("event_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    # SET NULL: удаление события или шаблона не стирает факт тренировки
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    workout_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workouts.id", ondelete="SET NULL"), nullable=True
    )
    # Снапшот: шаблон могут переименовать или удалить, история остаётся читаемой
    workout_name: Mapped[str] = mapped_column(String(100))
    date: Mapped[date_type] = mapped_column()
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sets: Mapped[list["WorkoutSessionSet"]] = relationship(
        back_populates="session",
        order_by="(WorkoutSessionSet.position, WorkoutSessionSet.set_index)",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class WorkoutSessionSet(Base):
    """Подход: план (снапшот цели шаблона) и факт. Подход, добавленный на ходу,
    плана не имеет."""

    __tablename__ = "workout_session_sets"
    __table_args__ = (
        UniqueConstraint("session_id", "position", "set_index", name="uq_workout_session_sets_slot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    # Индекс под историю упражнения: join на сессии владельца, сортировка по дате
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"), index=True)
    set_index: Mapped[int] = mapped_column(SmallInteger)
    mode: Mapped[WorkoutItemMode] = mapped_column(String(8))
    planned_reps: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    planned_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_duration_sec: Mapped[int | None] = mapped_column(nullable=True)
    reps: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
