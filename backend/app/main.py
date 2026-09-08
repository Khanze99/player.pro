import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router
from app.config import settings

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# Пересчёт DailyMetric вынесен в Celery (worker + beat, docs/plan-celery-recalc.md):
# ночной прогон ставит Beat, live-пересчёт при сабмите wellness/RPE ставится в очередь
# после коммита. Внутри процесса API его больше нет.
app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Гербы организаций (docs/plan-org-branding.md). Файлы кладём мы вместе с темой;
# при деплое каталог должен быть на volume, иначе переживёт только один релиз.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Аватары профиля (docs/plan-profile.md). Сознательно НЕ монтируются как статика:
# лицо человека — персданные, раздаётся только авторизованным GET /users/{id}/avatar.
# Каталог так же обязан быть на volume в проде.
(Path(__file__).resolve().parent.parent / settings.media_dir / "avatars").mkdir(parents=True, exist_ok=True)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
