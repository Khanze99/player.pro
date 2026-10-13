"""Справочник упражнений.

Сегодня — только сидовый слой из открытого датасета (docs/plan-exercise-catalog.md).
Личные/клубные упражнения (source=custom) — задел на будущее, в этом слое не
заполняются.
"""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import ExerciseBodyPart, ExerciseSource


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        Index("ix_exercises_body_part", "body_part"),
        # Импорт датасета перезаливается целиком при обновлении: external_id
        # уникален в рамках импортированного слоя, чтобы повторный прогон
        # обновлял карточку, а не плодил дубли (как uq_food_items_off_barcode).
        # Индекс частичный: будущее personal/club-упражнение (source=custom) не
        # имеет external_id и не должно попадать под это ограничение.
        Index(
            "uq_exercises_external_id",
            "external_id",
            unique=True,
            postgresql_where=text("source = 'exercises_dataset' AND external_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source: Mapped[ExerciseSource] = mapped_column(String(20), default=ExerciseSource.exercises_dataset)
    external_id: Mapped[str | None] = mapped_column(String(16), nullable=True)

    name_en: Mapped[str] = mapped_column(String(255))
    name_ru: Mapped[str] = mapped_column(String(255))
    name_es: Mapped[str] = mapped_column(String(255))

    body_part: Mapped[ExerciseBodyPart] = mapped_column(String(16))
    equipment: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(64))
    muscle_group: Mapped[str] = mapped_column(String(64))
    secondary_muscles: Mapped[list[str]] = mapped_column(ARRAY(String))

    instructions_en: Mapped[str] = mapped_column(Text)
    instructions_ru: Mapped[str] = mapped_column(Text)
    instructions_es: Mapped[str] = mapped_column(Text)
    steps_en: Mapped[list[str]] = mapped_column(ARRAY(Text))
    steps_ru: Mapped[list[str]] = mapped_column(ARRAY(Text))
    steps_es: Mapped[list[str]] = mapped_column(ARRAY(Text))

    # Файлы не копируются и не раздаются на этом шаге — только путь из датасета.
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gif_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Личные/клубные упражнения (задел на будущее) — NULL у сидовых записей
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
