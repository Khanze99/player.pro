"""Celery-задачи пересчёта DailyMetric (docs/plan-celery-recalc.md).

Тонкий слой, как роут: задача берёт сессию и зовёт `analytics_service`, бизнес-логики
и прямых запросов к БД здесь нет. Аргументы — только id и даты: тело задачи уходит в
брокер, персональные и медицинские данные в него не кладём.
"""

import uuid
from datetime import date

from sqlalchemy.exc import OperationalError

from app.celery_app import celery_app
from app.services import analytics_service
from app.tasks import runtime

_ATHLETE_LOCK_TTL = 600
_ALL_LOCK_TTL = 3600


async def _recalc_athlete(athlete_id: str, end_date: str | None) -> dict:
    async with runtime.session_factory()() as db:
        days = await analytics_service.recalc_athlete(
            db,
            uuid.UUID(athlete_id),
            end_date=date.fromisoformat(end_date) if end_date else None,
            commit=True,
        )
    return {"athlete_id": athlete_id, "recalculated_days": days}


async def _recalc_all(end_date: str | None) -> dict:
    async with runtime.session_factory()() as db:
        days = await analytics_service.recalc_all(
            db, end_date=date.fromisoformat(end_date) if end_date else None
        )
    return {"recalculated_days": days}


@celery_app.task(
    name="app.tasks.analytics_tasks.recalc_athlete",
    bind=True,
    max_retries=5,
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_backoff_max=60,
)
def recalc_athlete(self, athlete_id: str, end_date: str | None = None) -> dict:
    with runtime.redis_lock(f"athlete:{athlete_id}", _ATHLETE_LOCK_TTL) as acquired:
        if not acquired:
            # Ряд уже пересчитывает другой прогон — подождём и повторим.
            raise self.retry(countdown=10)
        return runtime.run_async(_recalc_athlete(athlete_id, end_date))


@celery_app.task(name="app.tasks.analytics_tasks.recalc_all")
def recalc_all(end_date: str | None = None) -> dict:
    with runtime.redis_lock("all", _ALL_LOCK_TTL) as acquired:
        if not acquired:
            return {"skipped": True}
        return runtime.run_async(_recalc_all(end_date))
