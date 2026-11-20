# player.pro (PlayerPro / ИгрокПро) — AGENTS.md

Платформа мониторинга состояния спортсменов (Athlete Management System). Импортозамещение PlayerPulse.
Ядро продукта: ежедневный wellness-опрос + RPE после нагрузки → Readiness Score, Load Ratio (ACWR), Availability.
Полное ТЗ: `PlayerPro_TZ_final.md` — источник истины по функционалу и формулам.

## Архитектура

```
player.pro/
├── mobile/          # React Native + Expo (iOS + Android) — клиент игрока; тренер/врач/админ тоже им пользуются
├── web/             # Next.js — кабинет тренера/врача (docs/plan-web-admin.md), admin.player-pro.ru
├── landing/         # Статический сайт-визитка + юр. документы (/privacy, /terms, /delete-account), без сборки, player-pro.ru
├── backend/         # FastAPI (Python) — REST API + WebSocket, вся бизнес-логика
├── infra/           # Docker Compose (PostgreSQL, Redis, nginx), конфиги деплоя
└── docs/            # Документация
```

## Стек

| Слой | Технология | Примечание |
|------|-----------|------------|
| Mobile | React Native + Expo | React Query + Zustand, i18next (ru/en/es), Victory Native, expo-secure-store, expo-notifications |
| Backend | FastAPI + Python 3.12 | Async SQLAlchemy 2.0, Pydantic v2 |
| БД | PostgreSQL 16 | Везде, включая локальную разработку (Docker). Миграции — Alembic, применяются вручную: `make migration m="…"` (autogenerate) → ревью → `make upgrade`. Имена файлов — datetime + описание. Тесты создают схему через `create_all` |
| Кэш/эфемерное | Redis 7 | OTP-коды, rate limiting, pub/sub для WebSocket |
| Контейнеры | Docker + Docker Compose | `infra/docker-compose.yml` |

## Структура backend (обязательное разделение слоёв)

Каждый неймспейс = тонкий роут + сервис с бизнес-логикой:

```
backend/app/
├── api/v1/       # слой роутов: HTTP, валидация, вызов сервиса (auth.py, wellness.py, rpe.py, ...)
├── services/     # сервисный слой: вся бизнес-логика (auth_service.py, wellness_service.py, ...)
├── models/       # SQLAlchemy-модели
├── schemas/      # Pydantic-схемы запросов/ответов
└── core/         # security (JWT), authz (роли), otp, calculations (EWMA/ACWR/Readiness)
```

Роуты не содержат бизнес-логики и не ходят в БД напрямую — только через сервисы.

## Роли и доступ

- **Глобальные роли**: `admin` (организация, команды, приглашения), `staff` (тренер/врач — доступ к назначенным командам), `player`.
- **Командные роли** (`TeamMembership`): `head_coach`, `coach`, `medic`, `athlete`.
- Мультитенантность по `organization_id`. Пользователь без организации — личный режим (свои опросы/RPE).
- **Authz — в коде бэкенда (`app/core/authz.py`), без RLS в БД.** Все правила в одном месте, покрыты тестами.

## Аутентификация

- OTP (6 цифр, TTL 5 мин, в Redis) по телефону/email → access-JWT (~15 мин) + refresh-токен (привязан к `device_id`, хэш в Postgres, отзываемый).
- 4-значный PIN — только локальный код на устройстве (secure-storage), **сервер про PIN не знает**.
- Эндпоинты: `/auth/otp/request`, `/auth/otp/verify`, `/auth/token/refresh`, `/auth/logout`, `/auth/me`.

## Аналитика (формулы — раздел 6 ТЗ)

- `session_load = RPE(1–10) × минуты`; `daily_load` = сумма за день, день без событий = 0 (не пропуск).
- EWMA: острая N=7 (λ=0.25), хроническая N=28 (λ≈0.069). ACWR = острая/хроническая; зоны: <0.8 серый, 0.8–1.3 зелёный, 1.3–1.5 жёлтый, >1.5 красный.
- Readiness 0–100: нормализация Ликерт 1–5 → взвешенное среднее (сон .25, энергия .25, боль .20, стресс .15, настроение .15) + модификаторы (пульс покоя, травма). Цвета: ≥75 зелёный, 55–74 жёлтый, <55 красный.
- Availability за 90 дней: % дней `full` от дней с любым статусом.
- Результаты денормализуются в `DailyMetric` (ночной пересчёт + live-обновление при сабмите wellness/RPE). Пересчёт идемпотентен.

## Команды разработки

У backend и mobile свои Makefile — использовать их.

```bash
# Инфраструктура (PostgreSQL + Redis)
docker compose -f infra/docker-compose.yml up -d

# Backend
cd backend
make install    # venv + зависимости
make dev        # uvicorn с reload
make test       # pytest (нужен запущенный postgres)
make lint       # ruff check + format --check
make migration m="описание"  # autogenerate-миграция Alembic (файл: YYYYMMDD_HHMM_описание)
make upgrade    # применить миграции до head (вручную, приложение само не мигрирует)

# Mobile
cd mobile
make install    # npm-зависимости
make start      # expo start
make ios / make android
```

## Тестирование

- Backend: `pytest` + `pytest-asyncio`, тесты бьют в реальную PostgreSQL (отдельная тестовая БД, контейнер из infra). **Не мокировать БД.**
- Обязательно покрыты тестами: authz-правила, формулы аналитики (EWMA/ACWR/Readiness), auth-флоу.
- Mobile: Jest + React Native Testing Library.

## Соглашения по коду

- Python: `ruff` (линтер + форматтер), типизация, Pydantic v2.
- TypeScript: strict mode, eslint + prettier.
- Ветки: `feat/`, `fix/`, `chore/`. Коммиты: Conventional Commits.

## Безопасность

- Access-JWT 15 мин; refresh-токены отзываемые, в БД только хэш; на устройстве — в secure-storage.
- Rate limiting OTP-запросов (номер/email/IP), лимит попыток ввода кода.
- Разграничение медицинской детали (medic) от тренерской (агрегаты/статусы). Исключение, согласованное 19.11.2026: в доступности тренер общей команды также читает диагноз врача при действующем согласии спортсмена; пишет диагноз только врач. Медицинский и тренерский статусы независимы, ни одна роль не снимает ограничение другой; admin без командной роли не имеет доступа к причинам и записи.
- Аудит-лог изменений статусов доступности/травм.
- Self-hosted инфраструктура, данные в РФ-контуре (152-ФЗ). TLS в транзите, шифрование покоя на уровне БД/диска.
- Все входные данные валидируются через Pydantic.


## Работа Codex

- Общаться с пользователем по-русски, если он не просит другой язык.
- Перед изменениями смотреть `git status`; сохранять чужие и незакоммиченные изменения.
- Для `mobile/` и `web/` действуют также вложенные `AGENTS.md`.
- Специализированные роли и процессы находятся в `.agents/skills/`; каталог и примеры вызова — `docs/agents.md`.
- Читать инструкции роли по необходимости, а не все скиллы на каждую задачу.
- Роли выполняются основной сессией. Отдельных субагентов запускать только при явном запросе пользователя или применимом указании инструкций; наличие роли само по себе не требует делегирования.
- Если поручена реализация, пройти подготовку, изменения и подходящие проверки без повторного запроса разрешения на уже порученную работу. Явный запрос только плана ограничивает работу планом.
- Команды сверять с актуальными Makefile, package.json и `docs/deploy.md`. Проверку применения/отката миграций выполнять на отдельной тестовой БД.
- `$release-checklist` составляет инструкции по выкатке; само составление чек-листа не поручает деплой.
