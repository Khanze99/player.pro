FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Каталоги под тома создаём в образе и отдаём пользователю app: пустой named-volume
# наследует владельца точки монтирования при первом маунте. Без этого Docker создаёт
# точку от root, и контейнер (USER app) не может писать — падают загрузки аватаров.
RUN useradd --create-home app \
 && mkdir -p /app/media/avatars /app/static/branding \
 && chown -R app /app
USER app

EXPOSE 8000
# Тот же образ обслуживает три роли (команда задаётся в compose):
#   api    — uvicorn (ниже, по умолчанию)
#   worker — celery -A app.celery_app worker
#   beat   — celery -A app.celery_app beat
# Пересчёт DailyMetric вынесен в Celery (docs/plan-celery-recalc.md), поэтому
# требования «один воркер uvicorn» у api больше нет.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
