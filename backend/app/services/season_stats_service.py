import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TeamRole
from app.models.season_stats import SeasonPlayerStats, SeasonPlayerStatValue, SportMetricDef
from app.models.team import Team, TeamMembership
from app.schemas.season_stats import (
    SeasonStatCreateIn,
    SeasonStatMetricValueOut,
    SeasonStatOut,
    SeasonStatUpdateIn,
)

# Живая копия справочника футбола — источник правды для прод/стенда остаётся
# data-сид в alembic/versions/20261105_2019_season_player_stats.py (миграции
# неизменны как исторический снимок, туда app-код не импортируют). Эта копия
# нужна тестам: make test поднимает схему через create_all (CLAUDE.md), не
# через Alembic, так что сид из миграции до тестовой БД не доезжает —
# tests/conftest.py вызывает seed_football_catalog() после create_all.
# Меняется каталог — правь оба места. Расширен 2026-11-05 до полного набора
# черновика-артефакта (14 метрик, см. docs/plan-player-season-stats.md).
FOOTBALL_METRICS: list[dict] = [
    dict(
        key="shots",
        category_key="shooting",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=6,
        sort_order=1,
    ),
    dict(
        key="shots_on_target",
        category_key="shooting",
        unit="percent",
        pct_of_key="shots",
        on_radar_default=True,
        radar_max=1,
        sort_order=2,
    ),
    dict(
        key="xg",
        category_key="shooting",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=1,
        sort_order=3,
    ),
    dict(
        key="passes",
        category_key="passing",
        unit=None,
        pct_of_key=None,
        on_radar_default=False,
        radar_max=60,
        sort_order=1,
    ),
    dict(
        key="passes_completed",
        category_key="passing",
        unit="percent",
        pct_of_key="passes",
        on_radar_default=False,
        radar_max=1,
        sort_order=2,
    ),
    dict(
        key="key_passes",
        category_key="passing",
        unit=None,
        pct_of_key=None,
        on_radar_default=False,
        radar_max=3,
        sort_order=3,
    ),
    dict(
        key="progressive_passes",
        category_key="passing",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=10,
        sort_order=4,
    ),
    dict(
        key="duels",
        category_key="duels",
        unit=None,
        pct_of_key=None,
        on_radar_default=False,
        radar_max=12,
        sort_order=1,
    ),
    dict(
        key="duels_won",
        category_key="duels",
        unit="percent",
        pct_of_key="duels",
        on_radar_default=True,
        radar_max=1,
        sort_order=2,
    ),
    dict(
        key="tackles",
        category_key="duels",
        unit=None,
        pct_of_key=None,
        on_radar_default=False,
        radar_max=4,
        sort_order=3,
    ),
    dict(
        key="clearances",
        category_key="duels",
        unit=None,
        pct_of_key=None,
        on_radar_default=False,
        radar_max=3,
        sort_order=4,
    ),
    dict(
        key="dribbles",
        category_key="dribbles",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=4,
        sort_order=1,
    ),
    dict(
        key="recoveries",
        category_key="possession",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=12,
        sort_order=1,
    ),
    dict(
        key="progressive_actions",
        category_key="possession",
        unit=None,
        pct_of_key=None,
        on_radar_default=True,
        radar_max=14,
        sort_order=2,
    ),
]


async def seed_football_catalog(db: AsyncSession) -> None:
    db.add_all(SportMetricDef(sport="football", **m) for m in FOOTBALL_METRICS)
    await db.commit()


async def get_metric_defs(db: AsyncSession, sport: str) -> list[SportMetricDef]:
    rows = await db.execute(
        select(SportMetricDef)
        .where(SportMetricDef.sport == sport)
        .order_by(SportMetricDef.category_key, SportMetricDef.sort_order)
    )
    return list(rows.scalars())


async def athlete_team(db: AsyncSession, athlete_id: uuid.UUID) -> Team | None:
    """Команда игрока (team_role=athlete) — источник Team.sport для записи.

    У игрока на практике одна команда; при нескольких (технически допустимо)
    берём любую — каталог метрик всё равно общий на организацию/спорт, не на
    конкретную команду.
    """
    row = await db.execute(
        select(Team)
        .join(TeamMembership, TeamMembership.team_id == Team.id)
        .where(TeamMembership.user_id == athlete_id, TeamMembership.team_role == TeamRole.athlete)
        .limit(1)
    )
    return row.scalar_one_or_none()


async def _validate_values(db: AsyncSession, sport: str, values: dict[str, float]) -> None:
    if not values:
        return
    defs = await get_metric_defs(db, sport)
    unknown = set(values) - {d.key for d in defs}
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неизвестные метрики для спорта «{sport}»: {', '.join(sorted(unknown))}",
        )


async def create_entry(
    db: AsyncSession, data: SeasonStatCreateIn, created_by: uuid.UUID
) -> SeasonPlayerStats:
    team = await athlete_team(db, data.athlete_id)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="У игрока нет команды — статистику некуда привязать",
        )
    if not team.sport:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="У команды не указан вид спорта — заполните его перед вводом статистики",
        )
    await _validate_values(db, team.sport, data.values)

    entry = SeasonPlayerStats(
        athlete_id=data.athlete_id,
        sport=team.sport,
        season=data.season,
        team_label=data.team_label,
        competition=data.competition,
        matches=data.matches,
        minutes=data.minutes,
        score=data.score,
        assists=data.assists,
        penalty_minor=data.penalty_minor,
        penalty_major=data.penalty_major,
        created_by=created_by,
        values=[SeasonPlayerStatValue(metric_key=k, value=v) for k, v in data.values.items()],
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def get_entry(db: AsyncSession, stat_id: uuid.UUID) -> SeasonPlayerStats:
    entry = await db.get(SeasonPlayerStats, stat_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена")
    return entry


async def update_entry(
    db: AsyncSession, entry: SeasonPlayerStats, data: SeasonStatUpdateIn
) -> SeasonPlayerStats:
    for field, value in data.model_dump(exclude_unset=True, exclude={"values"}).items():
        setattr(entry, field, value)
    if data.values is not None:
        await _validate_values(db, entry.sport, data.values)
        # Явный DELETE + flush, не entry.values = [...]: delete-orphan через
        # переприсвоение коллекции не гарантирует DELETE старых строк раньше
        # INSERT новых — при том же metric_key это падает в unique-констрейнт
        # (season_stat_id, metric_key), проверено (422→ловится, тут 500 падал).
        await db.execute(
            delete(SeasonPlayerStatValue).where(SeasonPlayerStatValue.season_stat_id == entry.id)
        )
        await db.flush()
        db.add_all(
            SeasonPlayerStatValue(season_stat_id=entry.id, metric_key=k, value=v)
            for k, v in data.values.items()
        )
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_entry(db: AsyncSession, entry: SeasonPlayerStats) -> None:
    await db.delete(entry)
    await db.commit()


async def list_athlete_entries(db: AsyncSession, athlete_id: uuid.UUID) -> list[SeasonPlayerStats]:
    rows = await db.execute(
        select(SeasonPlayerStats)
        .where(SeasonPlayerStats.athlete_id == athlete_id)
        .order_by(SeasonPlayerStats.season.desc(), SeasonPlayerStats.created_at.desc())
    )
    return list(rows.scalars())


def _per_90(value: float, minutes: int) -> float | None:
    return round(value * 90 / minutes, 2) if minutes else None


def to_out(entry: SeasonPlayerStats, metric_defs: list[SportMetricDef]) -> SeasonStatOut:
    """Производные per-90/% — тут, не хранятся (см. план): записей на игрока
    единицы, денормализация добавила бы риск рассинхрона без выгоды."""
    defs_by_key = {d.key: d for d in metric_defs}
    values_by_key = {v.metric_key: float(v.value) for v in entry.values}

    metrics = []
    for v in entry.values:
        raw = float(v.value)
        metric_def = defs_by_key.get(v.metric_key)
        pct = None
        if metric_def and metric_def.pct_of_key:
            denom = values_by_key.get(metric_def.pct_of_key)
            if denom:
                pct = round(raw / denom, 4)
        metrics.append(
            SeasonStatMetricValueOut(key=v.metric_key, value=raw, per_90=_per_90(raw, entry.minutes), pct=pct)
        )

    return SeasonStatOut(
        id=entry.id,
        athlete_id=entry.athlete_id,
        sport=entry.sport,
        season=entry.season,
        team_label=entry.team_label,
        competition=entry.competition,
        matches=entry.matches,
        minutes=entry.minutes,
        score=entry.score,
        assists=entry.assists,
        penalty_minor=entry.penalty_minor,
        penalty_major=entry.penalty_major,
        score_per_90=_per_90(entry.score, entry.minutes),
        assists_per_90=_per_90(entry.assists, entry.minutes),
        metrics=metrics,
        created_by=entry.created_by,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


async def list_athlete_entries_out(db: AsyncSession, athlete_id: uuid.UUID) -> list[SeasonStatOut]:
    entries = await list_athlete_entries(db, athlete_id)
    defs_by_sport = {sport: await get_metric_defs(db, sport) for sport in {e.sport for e in entries}}
    return [to_out(e, defs_by_sport[e.sport]) for e in entries]
