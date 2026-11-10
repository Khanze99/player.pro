"""Периодические задачи колокольчика (docs/plan-notifications.md).

Тонкий слой, как роут: сессия + вызов `notifications_service`. Повторный прогон
безопасен: напоминания идемпотентны по dedup_key, чистка просто удаляет старое.
"""

from sqlalchemy.exc import OperationalError

from app.celery_app import celery_app
from app.services import notifications_service
from app.tasks import runtime


async def _rpe_reminders() -> dict:
    async with runtime.session_factory()() as db:
        sent = await notifications_service.send_rpe_reminders(db)
        await db.commit()
    return {"candidates": sent}


async def _wellness_reminders() -> dict:
    async with runtime.session_factory()() as db:
        sent = await notifications_service.send_wellness_reminders(db)
        await db.commit()
    return {"candidates": sent}


async def _cleanup() -> dict:
    async with runtime.session_factory()() as db:
        deleted = await notifications_service.cleanup_old(db)
        await db.commit()
    return {"deleted": deleted}


@celery_app.task(
    name="app.tasks.notification_tasks.rpe_reminders", autoretry_for=(OperationalError,), max_retries=3
)
def rpe_reminders() -> dict:
    return runtime.run_async(_rpe_reminders())


@celery_app.task(
    name="app.tasks.notification_tasks.wellness_reminders", autoretry_for=(OperationalError,), max_retries=3
)
def wellness_reminders() -> dict:
    return runtime.run_async(_wellness_reminders())


@celery_app.task(name="app.tasks.notification_tasks.cleanup")
def cleanup() -> dict:
    return runtime.run_async(_cleanup())
