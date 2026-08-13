# PlayerPro — корневой Makefile (оркестрация)
COMPOSE := docker compose -f infra/docker-compose.yml
STAND := docker compose -f infra/docker-compose.stand.yml --env-file infra/.env

.PHONY: help infra-up infra-down backend-dev backend-test mobile-start \
        stand-env stand-up stand-down stand-logs stand-ps stand-seed stand-migrate stand-test stand-reset

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

infra-up: ## PostgreSQL + Redis для локальной разработки
	$(COMPOSE) up -d

infra-down: ## Остановить инфраструктуру разработки
	$(COMPOSE) down

backend-dev: ## Dev-сервер бэкенда
	$(MAKE) -C backend dev

backend-test: ## Тесты бэкенда
	$(MAKE) -C backend test

mobile-start: ## Expo dev-сервер
	$(MAKE) -C mobile start

# --- Тестовый стенд: postgres + redis + миграции + API в контейнерах ---

infra/.env:
	@cp infra/.env.example infra/.env
	@PW=$$(openssl rand -hex 32); SK=$$(openssl rand -hex 32); \
	  sed -i.bak -e "s|^SECRET_KEY=.*|SECRET_KEY=$$SK|" infra/.env && rm -f infra/.env.bak
	@echo "infra/.env создан, секреты сгенерированы"

stand-env: infra/.env ## Создать infra/.env со сгенерированными секретами (если его нет)

stand-up: infra/.env ## Поднять тестовый стенд (сборка + миграции + API)
	$(STAND) up -d --build
	@echo "API: http://localhost:$$(grep -E '^API_PORT=' infra/.env | cut -d= -f2 || echo 8000)/docs"

stand-down: ## Остановить стенд (данные сохраняются)
	$(STAND) down

stand-reset: ## Остановить стенд и удалить данные (том БД)
	$(STAND) down -v

stand-logs: ## Логи API стенда
	$(STAND) logs -f api

stand-ps: ## Статус контейнеров стенда
	$(STAND) ps

stand-migrate: ## Накатить миграции на стенде (после git pull)
	$(STAND) run --rm migrate

stand-seed: ## Демо-данные на стенде (команда 25 игроков + месяц нагрузки)
	$(STAND) --profile seed run --rm seed

stand-test: ## Прогнать backend-тесты внутри стенда (отдельная БД playerpro_test)
	$(STAND) run --rm api sh -c 'TEST_DATABASE_URL=$$DATABASE_URL"_test" pytest -q'
