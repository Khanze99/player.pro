import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.season_stats import (
    Season,
    SeasonStatCreateIn,
    SeasonStatOut,
    SeasonStatUpdateIn,
    SportMetricDefOut,
    TeamBenchmarkOut,
)
from app.services import season_stats_service

router = APIRouter(prefix="/season-stats", tags=["season-stats"])


@router.get("/sports/{sport}/metrics", response_model=list[SportMetricDefOut])
async def sport_metrics(sport: str, user: CurrentUser, db: DbSession):
    # user только чтобы оставаться за require_consented — справочник, не
    # персональные данные, доступен любому авторизованному без доп. проверок.
    return await season_stats_service.get_metric_defs(db, sport)


@router.get("/athletes/{athlete_id}", response_model=list[SeasonStatOut])
async def athlete_season_stats(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    return await season_stats_service.list_athlete_entries_out(db, athlete_id)


@router.get("/teams/{team_id}/benchmark", response_model=TeamBenchmarkOut)
async def team_benchmark(
    team_id: uuid.UUID, user: CurrentUser, db: DbSession, season: Annotated[Season, Query()]
):
    # Агрегат по составу: только штаб команды и admin организации, не игроки
    await authz.require_team_staff(db, user, team_id)
    team = await authz.get_team(db, team_id)
    return await season_stats_service.team_benchmark(db, team, season)


@router.post("", response_model=SeasonStatOut, status_code=201)
async def create_season_stat(data: SeasonStatCreateIn, user: CurrentUser, db: DbSession):
    await authz.ensure_can_manage_season_stats(db, user, data.athlete_id)
    entry = await season_stats_service.create_entry(db, data, user.id)
    defs = await season_stats_service.get_metric_defs(db, entry.sport)
    return season_stats_service.to_out(entry, defs)


@router.patch("/{stat_id}", response_model=SeasonStatOut)
async def update_season_stat(stat_id: uuid.UUID, data: SeasonStatUpdateIn, user: CurrentUser, db: DbSession):
    entry = await season_stats_service.get_entry(db, stat_id)
    await authz.ensure_can_manage_season_stats(db, user, entry.athlete_id)
    entry = await season_stats_service.update_entry(db, entry, data)
    defs = await season_stats_service.get_metric_defs(db, entry.sport)
    return season_stats_service.to_out(entry, defs)


@router.delete("/{stat_id}", status_code=204)
async def delete_season_stat(stat_id: uuid.UUID, user: CurrentUser, db: DbSession):
    entry = await season_stats_service.get_entry(db, stat_id)
    await authz.ensure_can_manage_season_stats(db, user, entry.athlete_id)
    await season_stats_service.delete_entry(db, entry)
