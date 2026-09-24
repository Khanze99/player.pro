import uuid
from datetime import date, timedelta

from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.celery_app import celery_app
from app.core import authz
from app.core import calculations as calc
from app.schemas.metric import (
    DailyMetricOut,
    ReadinessBreakdownAverageOut,
    ReadinessBreakdownOut,
    ReadinessComponentOut,
    RecalcDispatchOut,
    RecalcStatusOut,
    StreakOut,
)
from app.services import analytics_service, streaks_service
from app.tasks.analytics_tasks import recalc_all as recalc_all_task

router = APIRouter(prefix="/analytics", tags=["analytics"])

BREAKDOWN_DEFAULT_WINDOW_DAYS = 7


def _breakdown_out(day: date, breakdown: calc.ReadinessBreakdown) -> ReadinessBreakdownOut:
    return ReadinessBreakdownOut(
        date=day,
        components=[ReadinessComponentOut(**vars(c)) for c in breakdown.components],
        hr_modifier=breakdown.hr_modifier,
        hr_flag=breakdown.hr_flag,
        injury=breakdown.injury,
        symptom=breakdown.symptom,
        unavailable_flag=breakdown.unavailable_flag,
        score=breakdown.score,
        zone=breakdown.zone,
    )


def _breakdown_average_out(
    date_from: date, date_to: date, average: calc.ReadinessBreakdownAverage
) -> ReadinessBreakdownAverageOut:
    return ReadinessBreakdownAverageOut(
        date_from=date_from,
        date_to=date_to,
        days_with_data=average.days_with_data,
        components=[ReadinessComponentOut(**vars(c)) for c in average.components],
        avg_score=average.avg_score,
    )


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


@router.get("/me/readiness-breakdown", response_model=ReadinessBreakdownOut)
async def my_readiness_breakdown(day: date, user: CurrentUser, db: DbSession):
    breakdown = await analytics_service.get_readiness_breakdown_day(db, user.id, day)
    if breakdown is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Опрос за эту дату не найден")
    return _breakdown_out(day, breakdown)


@router.get("/me/readiness-breakdown/average", response_model=ReadinessBreakdownAverageOut)
async def my_readiness_breakdown_average(
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=BREAKDOWN_DEFAULT_WINDOW_DAYS - 1)
    average = await analytics_service.get_readiness_breakdown_average(db, user.id, date_from, date_to)
    return _breakdown_average_out(date_from, date_to, average)


@router.get("/athletes/{athlete_id}/readiness-breakdown", response_model=ReadinessBreakdownOut)
async def athlete_readiness_breakdown(athlete_id: uuid.UUID, day: date, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    breakdown = await analytics_service.get_readiness_breakdown_day(db, athlete_id, day)
    if breakdown is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Опрос за эту дату не найден")
    return _breakdown_out(day, breakdown)


@router.get("/athletes/{athlete_id}/readiness-breakdown/average", response_model=ReadinessBreakdownAverageOut)
async def athlete_readiness_breakdown_average(
    athlete_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=BREAKDOWN_DEFAULT_WINDOW_DAYS - 1)
    average = await analytics_service.get_readiness_breakdown_average(db, athlete_id, date_from, date_to)
    return _breakdown_average_out(date_from, date_to, average)


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
