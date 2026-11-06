import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class SportMetricDef(Base):
    """Справочник метрик по виду спорта (docs/plan-player-season-stats.md).

    Сидится миграцией, не правится через UI в MVP. Подписи — не тут: сервер
    отдаёт только машиночитаемые key/category_key, текст подставляет клиент
    (тот же приём, что у остальных кодов в проекте — AlertReason и т.п.).
    """

    __tablename__ = "sport_metric_defs"
    __table_args__ = (UniqueConstraint("sport", "key", name="uq_sport_metric_defs_sport_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Свободный текст, тот же словарь значений, что Team.sport — без ограничения values
    sport: Mapped[str] = mapped_column(String(32), index=True)
    key: Mapped[str] = mapped_column(String(64))
    category_key: Mapped[str] = mapped_column(String(32))
    unit: Mapped[str | None] = mapped_column(String(16), nullable=True)  # null (счётчик) | "percent"
    # Для unit="percent": key метрики-знаменателя в этом же спорте
    pct_of_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    on_radar_default: Mapped[bool] = mapped_column(default=False)
    radar_max: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)


class SeasonPlayerStats(Base):
    """Сезонная статистика игрока — общее ядро, одинаковое для любого спорта.

    Разбивка по категориям — в SeasonPlayerStatValue по каталогу SportMetricDef,
    не фиксированными столбцами (мультиспорт с самого начала, см. план).
    """

    __tablename__ = "season_player_stats"
    # Одна запись на игрока + сезон + команду + турнир: без ключа повторное
    # сохранение той же записи удваивало «Все турниры» в паспорте. NULLS NOT
    # DISTINCT (PG15+): «без турнира» тоже уникален, а не бесконечно дублируем.
    __table_args__ = (
        UniqueConstraint(
            "athlete_id",
            "season",
            "team_label",
            "competition",
            name="uq_season_player_stats_entry",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # Спорт команды игрока на момент записи — фиксируется, не меняется задним
    # числом при смене Team.sport
    sport: Mapped[str] = mapped_column(String(32))
    season: Mapped[str] = mapped_column(String(16))  # "2024/25", произвольный текст
    # "Основа" / "Сборная Татарстана U16" — текст, не FK: своя команда или внешняя
    team_label: Mapped[str] = mapped_column(String(128))
    competition: Mapped[str | None] = mapped_column(String(128), nullable=True)

    matches: Mapped[int] = mapped_column(SmallInteger, default=0)
    minutes: Mapped[int] = mapped_column(default=0)
    score: Mapped[int] = mapped_column(SmallInteger, default=0)  # голы/очки/шайбы (generic)
    assists: Mapped[int] = mapped_column(SmallInteger, default=0)  # результативные передачи
    penalty_minor: Mapped[int] = mapped_column(SmallInteger, default=0)  # ЖК / малый штраф
    penalty_major: Mapped[int] = mapped_column(SmallInteger, default=0)  # КК / удаление

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Значения метрик по категориям — деталь, та же схема, что WellnessEntry.pain_points
    values: Mapped[list["SeasonPlayerStatValue"]] = relationship(
        back_populates="season_stat",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SeasonPlayerStatValue(Base):
    """Значение одной метрики каталога для конкретной записи сезонной статистики."""

    __tablename__ = "season_player_stat_values"
    __table_args__ = (
        UniqueConstraint("season_stat_id", "metric_key", name="uq_season_stat_value_stat_metric"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    season_stat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("season_player_stats.id", ondelete="CASCADE"), index=True
    )
    # Смысловая ссылка на SportMetricDef.key (sport уже зафиксирован записью) —
    # не физический FK ради простоты
    metric_key: Mapped[str] = mapped_column(String(64))
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    season_stat: Mapped["SeasonPlayerStats"] = relationship(back_populates="values")
