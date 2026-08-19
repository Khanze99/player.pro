# player.pro (PlayerPro / ИгрокПро)

Платформа мониторинга состояния спортсменов: ежедневный wellness-опрос + RPE после нагрузки
→ Readiness Score, Load Ratio (ACWR), Availability. Полное ТЗ — `PlayerPro_TZ_final.md`,
рабочие соглашения — `CLAUDE.md`.

| Каталог | Что это |
|---|---|
| `backend/` | FastAPI + PostgreSQL + Redis — вся бизнес-логика |
| `mobile/` | React Native + Expo — единственный клиент (игрок, тренер, врач, админ) |
| `infra/` | Docker Compose: инфраструктура разработки и тестовый стенд |
| `web/` | Next.js — зарезервировано, пост-MVP |
| `docs/` | `deploy.md` — вывод на Yandex Cloud и сборка APK |

## Тестовый стенд: клонировать и поднять

Нужен только Docker (Engine 24+ / Docker Desktop) и `make`. Ни Python, ни Node на хосте
не требуются — бэкенд, миграции и БД собираются в контейнерах.

```bash
git clone https://github.com/Khanze99/player.pro.git && cd player.pro

make stand-env    # создаст infra/.env со сгенерированными секретами
make stand-up     # сборка образа + postgres + redis + alembic upgrade head + API
curl http://localhost:8000/health      # {"status":"ok"}
open http://localhost:8000/docs        # Swagger
```

`make stand-seed` заливает демо-данные (команда из 25 игроков и месяц нагрузки) — с ними
сразу видно тренерский дашборд. Вход тренером: `coach@demo.playerpro.local`.

Войти на стенде можно, потому что при `DEBUG=true` эндпоинт `POST /api/v1/auth/otp/request`
возвращает OTP-код прямо в ответе: SMS/email-шлюза в проекте ещё нет. Это же делает стенд
открытым для всех, кто до него дотянется — наружу без ограничения доступа не выставлять,
для прода `DEBUG=false` и чек-лист в `docs/deploy.md`.

Команды стенда:

| Команда | Что делает |
|---|---|
| `make stand-up` | Поднять (пересобирает образ) |
| `make stand-down` | Остановить, данные сохранить |
| `make stand-reset` | Остановить и удалить том с данными |
| `make stand-logs` | Логи API |
| `make stand-ps` | Статус контейнеров |
| `make stand-migrate` | Накатить миграции после `git pull` |
| `make stand-seed` | Демо-данные |
| `make stand-test` | Прогнать backend-тесты внутри стенда |

Порт API меняется через `API_PORT` в `infra/.env`. Порты PostgreSQL и Redis наружу не
выведены — они видны только внутри compose-сети.

## Локальная разработка

Здесь бэкенд запускается на хосте, в Docker только PostgreSQL (порт 5433) и Redis:

```bash
make infra-up                  # postgres + redis
cd backend && make install     # venv + зависимости (нужен Python 3.12)
cp .env.example .env
make upgrade                   # миграции применяются вручную
make dev                       # uvicorn на :8000
make test                      # pytest по реальной БД playerpro_test

cd ../mobile && make install && make start   # Expo, нужен Node 20+
```

Мобильный клиент в dev-режиме сам выводит адрес бэкенда из хоста Expo-сервера; для стенда
и прода адрес задаётся явно через `EXPO_PUBLIC_API_URL` (см. `mobile/.env.example` и раздел
про EAS Build в `docs/deploy.md`).

## Заметки по продукту

- Сравнение с PlayerPulse по цене: Standard — $36 за игрока в год; PlayerPulse + BeyondPulse —
  $290 за игрока за 2 года по предоплате, с железом (GPS-трекер: дистанция, пульс, спринты, скорость).
- Публикация в App Store — отдельная задача.
- фича флаги в базу
- 

yc compute ssh \
  --id fv4442ilvle2o2t5nifc \
  --identity-file /Users/akhamidov/.ssh/ssh-key-1786553459277 --login khanze
