import uuid
from datetime import date, timedelta

from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.celery_app import celery_app
from app.core import authz
from app.schemas.metric import DailyMetricOut, RecalcDispatchOut, RecalcStatusOut, StreakOut
from app.services import analytics_service, streaks_service
from app.tasks.analytics_tasks import recalc_all as recalc_all_task

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


@router.post("/recalc", status_code=status.HTTP_202_ACCEPTED, response_model=RecalcDispatchOut)
async def recalc(user: CurrentUser):
    """Ручной запуск полного пересчёта (админ). Ставит задачу в Celery, не ждёт её."""
    await authz.require_org_admin(user)
    try:
        async_result = recalc_all_task.delay()
    except Exception as exc:  # noqa: BLE001 — брокер недоступен
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Очередь пересчёта недоступна",
        ) from exc
    return RecalcDispatchOut(task_id=async_result.id)


@router.get("/recalc/{task_id}", response_model=RecalcStatusOut)
async def recalc_status(task_id: str, user: CurrentUser):
    """Статус ранее поставленной задачи пересчёта (админ)."""
    await authz.require_org_admin(user)
    result = AsyncResult(task_id, app=celery_app)
    out = RecalcStatusOut(task_id=task_id, state=result.state)
    if result.successful():
        payload = result.result if isinstance(result.result, dict) else {}
        out.recalculated_days = payload.get("recalculated_days")
        out.skipped = bool(payload.get("skipped", False))
    elif result.failed():
        err = result.result
        out.error = type(err).__name__ if isinstance(err, BaseException) else str(err)
    return out
