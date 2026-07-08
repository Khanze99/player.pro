# PlayerPro Mobile — React Native + Expo

Единственный клиент MVP: игрок, тренер, врач, админ (роли из ТЗ, раздел 2).

> **Проект уже создан** (Expo SDK 57, expo-router, роуты в `src/app/`). Игроцкие экраны —
> по `PlayerPro_design_TZ.md`: PIN/OTP-вход, «Дом» с кольцом готовности, опрос, RPE,
> история, профиль; RU/EN/ES; офлайн-очередь опросов/RPE. Раздел «Создание проекта
> с нуля» ниже оставлен как справка — повторно запускать `make init` не нужно.
> Требование окружения: **Node ≥ 20.19.4** (SDK 57).

## Предварительные требования

| Инструмент | Версия | Установка (macOS) |
|---|---|---|
| Node.js | ≥ 20 LTS | `brew install node@20` |
| Watchman | последняя | `brew install watchman` |
| Xcode + iOS Simulator | последняя | App Store → Xcode → `xcode-select --install` |
| Android Studio + SDK + эмулятор | последняя | https://developer.android.com/studio (переменная `ANDROID_HOME`) |
| Expo-аккаунт (для EAS-сборок) | — | https://expo.dev → `npm i -g eas-cli` |

Для быстрого старта на реальном устройстве достаточно приложения **Expo Go** (App Store / Google Play) — Xcode/Android Studio не нужны.

## Создание проекта с нуля (одна команда — `make init`)

```bash
# 1. Скаффолд Expo-приложения (TypeScript, expo-router) прямо в mobile/
npx create-expo-app@latest . --template default

# 2. Зависимости по стеку ТЗ (раздел 10)
npx expo install expo-secure-store expo-notifications expo-localization
npm install @tanstack/react-query zustand i18next react-i18next victory-native
npx expo install react-native-svg          # peer-зависимость victory-native

# 3. Проверка окружения
npx expo-doctor
```

Что за что отвечает:
- `expo-secure-store` — refresh-токен и хэш PIN (PIN живёт только на устройстве, раздел 5 ТЗ);
- `expo-notifications` — push: утренний wellness, RPE после события, расписание (раздел 9);
- `@tanstack/react-query` — серверное состояние + офлайн-очередь мутаций (wellness/RPE офлайн, раздел 11);
- `zustand` — локальное состояние (сессия, выбранная команда);
- `i18next` + `react-i18next` + `expo-localization` — RU/EN/ES (раздел 8);
- `victory-native` — графики нагрузки/ACWR/Readiness.

## Запуск

```bash
make install    # npm install
make start      # expo dev-сервер (QR-код для Expo Go)
make ios        # сборка + запуск в iOS-симуляторе
make android    # сборка + запуск в Android-эмуляторе
make lint       # eslint
make test       # jest
make doctor     # npx expo-doctor — диагностика окружения
```

Бэкенд должен быть запущен (`cd ../backend && make infra-up && make dev`).
API-адрес задаётся в `.env`: `EXPO_PUBLIC_API_URL=http://localhost:8000` (для физического
устройства — IP машины в локальной сети, например `http://192.168.1.10:8000`).

## Продакшн-сборки (EAS)

```bash
npm i -g eas-cli
eas login
eas build:configure          # создаст eas.json
eas build -p ios             # сборка для App Store / TestFlight
eas build -p android         # .aab для Google Play (или -p android --profile preview для .apk)
eas submit -p ios            # отправка в App Store Connect
```

Push-уведомления в проде требуют FCM-ключа (Android) и APNs-ключа (iOS) в настройках
Expo-проекта: https://docs.expo.dev/push-notifications/push-notifications-setup/

## Структура (ориентир после скаффолда)

```
mobile/
├── app/                 # экраны (expo-router, file-based routing)
│   ├── (auth)/          # OTP-вход, ввод PIN
│   ├── (athlete)/       # опрос, RPE, мои метрики, стрики
│   └── (staff)/         # Squad Status, аналитика, расписание, доступность
├── src/
│   ├── api/             # клиент REST + React Query хуки
│   ├── auth/            # PIN, secure-store, refresh-флоу
│   ├── i18n/            # каталоги ru/en/es
│   └── stores/          # zustand
└── assets/
```
