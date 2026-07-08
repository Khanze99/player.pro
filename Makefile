# PlayerPro — корневой Makefile (оркестрация)
COMPOSE := docker compose -f infra/docker-compose.yml

.PHONY: help infra-up infra-down backend-dev backend-test mobile-start

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'

infra-up: ## PostgreSQL + Redis
	$(COMPOSE) up -d

infra-down: ## Остановить инфраструктуру
	$(COMPOSE) down

backend-dev: ## Dev-сервер бэкенда
	$(MAKE) -C backend dev

backend-test: ## Тесты бэкенда
	$(MAKE) -C backend test

mobile-start: ## Expo dev-сервер
	$(MAKE) -C mobile start
