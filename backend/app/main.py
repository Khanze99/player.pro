import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router
from app.config import settings
from app.database import AsyncSessionLocal
from app.services import analytics_service

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def _nightly_recalc_loop() -> None:
    """Ночной пересчёт DailyMetric (раздел 10 ТЗ). Полноценный планировщик — пост-MVP."""
    while True:
        now = datetime.now(UTC)
        next_run = now.replace(hour=settings.nightly_recalc_hour_utc, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            async with AsyncSessionLocal() as db:
                days = await analytics_service.recalc_all(db)
            logger.info("Nightly recalc done: %s athlete-days", days)
        except Exception:
            logger.exception("Nightly recalc failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Схема БД ведётся миграциями Alembic и применяется вручную: make upgrade
    task: asyncio.Task | None = None
    if settings.nightly_recalc_enabled:
        task = asyncio.create_task(_nightly_recalc_loop())
    yield
    if task is not None:
        task.cancel()


app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
