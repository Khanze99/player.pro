import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.metric import DailyMetricOut, StreakOut
from app.services import analytics_service, streaks_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/me/metrics", response_model=list[DailyMetricOut])
async def my_metrics(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=28)
    return await analytics_service.get_metrics(db, user.id, date_from, date_to)


@router.get("/me/streaks", response_model=list[StreakOut])
async def my_streaks(user: CurrentUser, db: DbSession):
    return await streaks_service.get_streaks(db, user.id)


@router.get("/athletes/{athlete_id}/metrics", response_model=list[DailyMetricOut])
async def athlete_metrics(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=28)
    return await analytics_service.get_metrics(db, athlete_id, date_from, date_to)


@router.post("/recalc", status_code=202)
async def recalc(user: CurrentUser, db: DbSession):
    """Ручной запуск пересчёта по организации (админ)."""
    await authz.require_org_admin(user)
    days = await analytics_service.recalc_all(db)
    return {"recalculated_days": days}
