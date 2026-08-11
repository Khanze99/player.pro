# PlayerPro backend
VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
COMPOSE := docker compose -f ../infra/docker-compose.yml

.PHONY: help install dev test lint format migration upgrade downgrade seed seed-reset foods foods-off infra-up infra-down clean

help: ## Список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

$(VENV)/bin/activate:
	python3.12 -m venv $(VENV) || python3 -m venv $(VENV)

install: $(VENV)/bin/activate ## Создать venv и поставить зависимости
	$(PIP) install -r requirements.txt

dev: ## Запустить dev-сервер (нужны postgres+redis: make infra-up)
	$(VENV)/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test: ## Прогнать тесты (реальная PostgreSQL, БД playerpro_test)
	$(VENV)/bin/pytest -q

lint: ## Проверка ruff (линт + формат)
	$(VENV)/bin/ruff check app tests
	$(VENV)/bin/ruff format --check app tests

format: ## Автоформатирование и автофиксы
	$(VENV)/bin/ruff check --fix app tests
	$(VENV)/bin/ruff format app tests

migration: ## Создать autogenerate-миграцию: make migration m="описание"
	@test -n "$(m)" || (echo 'Нужно описание: make migration m="add locations table"'; exit 1)
	$(VENV)/bin/alembic revision --autogenerate -m "$(m)"

upgrade: ## Применить миграции до head
	$(VENV)/bin/alembic upgrade head

downgrade: ## Откатить последнюю миграцию
	$(VENV)/bin/alembic downgrade -1

seed: ## Демо-данные: команда 25 игроков + месяц нагрузки (не трогает реальных юзеров)
	$(PYTHON) scripts/seed_demo.py

seed-reset: ## Пересоздать демо-данные с нуля
	$(PYTHON) scripts/seed_demo.py --reset

foods: ## Базовый справочник продуктов (~50 позиций)
	$(PYTHON) scripts/import_foods.py

foods-off: ## Импорт дампа Open Food Facts: make foods-off f=path/to/dump.csv.gz
	@test -n "$(f)" || (echo 'Нужен путь: make foods-off f=en.openfoodfacts.org.products.csv.gz'; exit 1)
	$(PYTHON) scripts/import_foods.py --off $(f)

infra-up: ## Поднять PostgreSQL + Redis
	$(COMPOSE) up -d postgres redis

infra-down: ## Остановить инфраструктуру
	$(COMPOSE) down

clean: ## Удалить venv и кэши
	rm -rf $(VENV) .pytest_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +
