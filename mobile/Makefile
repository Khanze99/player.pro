# PlayerPro mobile (React Native + Expo)

.PHONY: help init install start ios android lint test doctor clean

help: ## Список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-10s\033[0m %s\n", $$1, $$2}'

init: ## Создать Expo-приложение с нуля + зависимости стека (см. README.md)
	npx create-expo-app@latest . --template default
	npx expo install expo-secure-store expo-notifications expo-localization react-native-svg
	npm install @tanstack/react-query zustand i18next react-i18next victory-native

install: ## Установить зависимости
	npm install

start: ## Expo dev-сервер (QR для Expo Go)
	npx expo start

start-clear: ## Expo dev-сервер (QR для Expo Go)
	npx expo start --clear

ios: ## Запуск в iOS-симуляторе
	npx expo run:ios

android: ## Запуск в Android-эмуляторе
	npx expo run:android

lint: ## Линтер
	npx expo lint

test: ## Тесты (jest)
	npx jest

doctor: ## Диагностика окружения
	npx expo-doctor

clean: ## Удалить node_modules и кэши
	rm -rf node_modules .expo
