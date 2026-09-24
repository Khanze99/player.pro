# PlayerPro web — кабинет тренера/врача (Next.js, docs/plan-web-admin.md)

.PHONY: help install dev build start lint clean

help: ## Список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Установить зависимости
	npm install

dev: ## Dev-сервер (нужен backend: make -C ../backend dev), порт 3000
	npm run dev

build: ## Production-сборка
	npm run build

start: ## Запустить production-сборку (после make build)
	npm run start

lint: ## Линтер (eslint) + проверка типов
	npx eslint .
	npx tsc --noEmit

clean: ## Удалить node_modules и кэш сборки
	rm -rf node_modules .next
