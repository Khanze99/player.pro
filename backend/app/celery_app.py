"""Celery: вынос пересчёта DailyMetric из процесса API (docs/plan-celery-recalc.md).

Брокер и result backend — тот же Redis, что и для OTP, но отдельные логические БД.
Ночной прогон ставит Celery Beat (сервис `beat` в docker-compose), а не asyncio-цикл
внутри uvicorn, как было раньше.
"""

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init, worker_process_shutdown

from app.config import settings
from app.tasks import runtime

celery_app = Celery(
    "playerpro",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.analytics_tasks"],
)

celery_app.conf.update(
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=settings.celery_task_always_eager,
    task_store_eager_result=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_queue="playerpro",
    result_expires=24 * 3600,
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    worker_max_tasks_per_child=200,
)

if settings.nightly_recalc_enabled:
    celery_app.conf.beat_schedule = {
        "nightly-recalc-all": {
            "task": "app.tasks.analytics_tasks.recalc_all",
            "schedule": crontab(hour=settings.nightly_recalc_hour_utc, minute=0),
        },
    }


@worker_process_init.connect
def _init_worker_runtime(**_kwargs):
    # После fork унаследованные loop/движок нерабочие — поднимаем свои в этом процессе.
    runtime.reset()
    runtime.ensure_loop()


@worker_process_shutdown.connect
def _shutdown_worker_runtime(**_kwargs):
    runtime.shutdown()
