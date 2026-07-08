# PlayerPro backend
VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
COMPOSE := docker compose -f ../infra/docker-compose.yml

.PHONY: help install dev test lint format infra-up infra-down clean

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

infra-up: ## Поднять PostgreSQL + Redis
	$(COMPOSE) up -d postgres redis

infra-down: ## Остановить инфраструктуру
	$(COMPOSE) down

clean: ## Удалить venv и кэши
	rm -rf $(VENV) .pytest_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +
