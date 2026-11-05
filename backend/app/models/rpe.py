import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class RpeEntry(Base):
    __tablename__ = "rpe_entries"

    # Одна оценка на сессию; свободных записей (event_id = NULL) за день может быть несколько
    __table_args__ = (
        Index(
            "uq_rpe_athlete_event",
            "athlete_id",
            "event_id",
            unique=True,
            postgresql_where=text("event_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # ondelete=SET NULL, не CASCADE: RPE — реальная оценка нагрузки игрока
    # (входит в session_load/ACWR), event_id=NULL — уже штатное состояние
    # «свободной» записи (см. docstring выше). Удаление события должно
    # отвязать оценку, а не стереть её. Тот же баг с DELETE /events/{id},
    # что и у Attendance — см. её комментарий в app/models/event.py.
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    date: Mapped[date_type] = mapped_column(index=True)
    exertion: Mapped[int] = mapped_column()  # RPE CR10, 1–10
    performance: Mapped[int] = mapped_column()  # 1–10
    duration_min: Mapped[int] = mapped_column()
    session_load: Mapped[int] = mapped_column()  # exertion × duration_min
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
