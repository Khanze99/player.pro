# План: веб-версия приложения как устанавливаемый PWA (доступ с iOS без нативной сборки)

Статус: **в работе.** Дата составления: 2026-09-09. Сделано 2026-09-10: этапы 1–2
(сборка веб-бандла + PWA-оболочка), 3–4 (бэкенд — no-op; nginx/compose/deploy.md),
5 (auth на вебе — PIN-обёртка refresh-токена), 6 частично (jest + 19 тестов).
Осталось: на ВМ — DNS `app.player-pro.ru` + certbot + первая выкладка; iOS-QA на
устройстве; аудит (7); ревью (8).

Отношение к источникам правды:
- **Дополняет `PlayerPro_TZ_final.md`.** ТЗ описывает продукт как «мобильное приложение»
  (раздел 1, 11); стек — «React Native + Expo» (раздел 11). Про веб-доставку и установку
  на домашний экран в ТЗ ничего нет.
- **Не строит зарезервированный `web/` (Next.js).** В `README.md` и
  `docs/functionality.md` (раздел «Экспорт, мессенджер, веб-клиент — пост-MVP») веб-клиент
  отложен. Здесь **не** про него: мы отдаём **тот же самый Expo/RN-приложение** через
  `react-native-web` как установочный PWA, чтобы дать пользователям iOS доступ до нативной
  сборки. Отдельный продуктовый веб-клиент из роадмапа этот план не отменяет и не заменяет.
- Нативный iOS-билд (EAS Build → TestFlight/App Store) — **вне объёма**, зафиксирован
  как будущий этап в конце документа.

Текущее состояние функционала — `docs/functionality.md`. Механику хостинга/TLS этот план
передаёт в `docs/deploy.md` (там уже есть nginx + Let's Encrypt для API).

## Решения, принятые в обсуждении 2026-09-09 (дополнено 2026-09-10)

- **Хостинг — на той же Yandex-ВМ, поддомен `app.player-pro.ru`, TLS обязателен.**
  PWA-установка и standalone на iOS требуют HTTPS; HTTPS-страница не может обращаться
  к HTTP-API (mixed content). Апекс `player-pro.ru` остаётся под сайт-визитку —
  это отдельная задача вне этого плана (свой стек и деплой, приложения не касается).
  Внешние статик-хостинги (Vercel/Netlify) отклонены: инфраструктура self-hosted,
  данные в РФ-контуре (152-ФЗ, `CLAUDE.md`).
- **TLS — certbot, а не traefik.** `docs/deploy.md` уже описывает certbot + nginx;
  traefik — лишний новый компонент. Сертификат — SAN на `app.player-pro.ru` (+ `api.`,
  если поднимаем, см. ниже) или wildcard `*.player-pro.ru`.
- **Топология — один поддомен, разделение по пути (same-origin).** `app.player-pro.ru/`
  отдаёт статику PWA, `app.player-pro.ru/api/` и `/ws` — reverse-proxy на `api:8000`.
  Это убирает и mixed content, и CORS разом: `EXPO_PUBLIC_API_URL=https://app.player-pro.ru`,
  а `src/api/client.ts` уже добавляет префикс `/api/v1`. nginx для статики — **не прокси**,
  а файловый сервер (`root` + `try_files`); проксируется только `/api/` и `/ws`.
  Отклонено: API **только** на отдельном `api.player-pro.ru` — браузерный PWA тогда
  ходит cross-origin, возвращается CORS + preflight + второй набор забот.
- **`api.player-pro.ru` — опционально, доп. server-блоком чистого прокси** на тот же
  бэкенд: для нативного APK / будущего iOS / внешних потребителей. Браузерный PWA всё
  равно зовёт относительный `/api/` (same-origin). Заводить, только если нужен «красивый»
  адрес API для не-браузерных клиентов; на этот план не влияет.
- **Expo web `output` меняем `static` → `single` (SPA).** Приложение используется как
  приложение, а не как набор страниц: одна `index.html`, клиентская маршрутизация,
  тривиальный nginx (`try_files … /index.html`). `static` даёт по HTML на маршрут и
  требует rewrite-правил без выгоды.
- **Service worker в MVP не делаем.** iOS ставит на домашний экран и открывает в
  standalone по manifest + apple-meta без SW. Оффлайна в продукте нет (в
  `functionality.md` не значится). Кэширующий SW — пункт роадмапа.
- **PIN-замок на вебе оставляем**, но храним не так, как на нативе — см. «Права доступа».
- **Нативный iOS — вне объёма.** Описан как будущий этап.
- **Шаблон веб-документа — через `public/index.html`, не `+html.tsx`.** При
  `output: 'single'` Expo (SDK 57) собирает `index.html` из шаблона
  `webTemplate.js`, который читает `public/index.html`, если он есть, и подставляет
  `%LANG_ISO_CODE%` / `%WEB_TITLE%`. `+html.tsx` работает только при `output: 'static'`.
- **Токены темы вынесены в `theme/tokens.ts`.** `theme/index.ts` реэкспортил провайдер,
  а `provider.tsx` на старте читает `defaultTheme` в `createContext` → на вебе
  circular-import ловил TDZ и приложение падало на пустой странице. `index.ts` теперь
  тонкая бочка (`export * from './tokens'` + провайдер); `provider.tsx` и `api/branding.ts`
  импортят `defaultTheme` из `./tokens`. Потребители по-прежнему берут `@/theme`.

## Зачем

- У части команды iPhone. Локальная нативная сборка под iOS сейчас недоступна
  (`docs/deploy.md`, раздел про EAS; память проекта — рантайм симулятора не качается),
  а Apple Developer / EAS iOS-профиль ещё не заведены.
- `react-native-web` уже в зависимостях (`mobile/package.json`), `expo-router` умеет
  веб-экспорт. Быстрый путь дать iOS-доступ — отдать это же приложение по HTTPS и
  показать, как поставить ярлык на домашний экран (standalone, своя иконка и сплеш).
- Побочно закрывает и десктоп-доступ (тренер за ноутбуком).

## Что уже есть

- `mobile/package.json`: `react-native-web ~0.21`, `react-dom`, `expo-router ~57`.
- `mobile/app.json`: блок `web` есть, но минимальный — `output: "static"`, только
  `favicon`. Нет `manifest`, `apple-touch-icon`, `theme_color`, `display`.
- `mobile/src/auth/storage.ts`: **веб-фолбэк secure-store → `localStorage` уже написан**
  (`Platform.OS === 'web'`). Значит auth-флоу на вебе в принципе стартует.
- `mobile/src/api/client.ts`: адрес API из `EXPO_PUBLIC_API_URL`, иначе — из хоста
  dev-сервера. Для веб-бандла нужно задать явный HTTPS-адрес на этапе экспорта.
- `backend/app/config.py`: `cors_origins` = `["http://localhost:3000", "http://localhost:8081"]`
  (8081 — порт `expo start --web`). Прод-origin не добавлен.
- `mobile/src/components/TimeField.tsx`: импортит `@expo/ui/community/datetime-picker` —
  **нативный модуль, веб-бандл на нём падает.** Нужен `.web` фолбэк.
- `mobile/src/app/food-add.tsx`: `expo-camera` `CameraView` + сканер штрихкода —
  на iOS Safari/standalone `BarcodeDetector` недоступен. Нужен веб-фолбэк (ручной ввод).
- `mobile/src/app/(tabs)/profile.tsx`: `expo-image-picker` для аватара — на вебе
  работает из коробки (`<input type=file>`), правок не требует.
- `mobile/assets/images/icon.png` (1024) — исходник для генерации PWA-иконок.
- `mobile/public/` — папки нет; Expo копирует её содержимое в корень веб-сборки.
- Оффлайн-очереди нет; сетевые ошибки уже обрабатываются (`NetworkError`, экраны
  «нет соединения»).

## Данные и миграции

**Не применимо.** Новых таблиц и полей нет, схема БД не затрагивается. Веб-доставка —
артефакт сборки и хостинга.

## API

Изменений контракта нет.

- **CORS не трогаем.** При топологии same-origin (см. решения) браузер шлёт запросы
  на тот же `app.player-pro.ru`, откуда загружен PWA — cross-origin нет, `cors_origins`
  менять не нужно. Правка `backend/app/config.py` понадобилась бы только при отказе
  от same-origin в пользу отдельного `api.` домена для браузера.
- Убедиться, что за прокси бэкенд корректно видит схему/хост: nginx проставляет
  `X-Forwarded-Proto` (уже есть в `playerpro.conf`), FastAPI должен доверять ему при
  формировании абсолютных ссылок (аватар, инвайты) — свериться в `app/main.py`.

Deep links: маршруты `expo-router` (`/invite`, `/wellness`, …) на вебе резолвятся
автоматически. Нужно проверить генерацию ссылок-приглашений: если где-то зашита схема
`playerpro://`, для веб-получателя ссылка должна быть
`https://app.player-pro.ru/invite?token=…`.

## Права доступа

Правила `core/authz` не меняются — доступ по-прежнему решает бэкенд по access-JWT.

**Хранение сессии и PIN на вебе (решение по развилке 3).**

Контекст: на нативе `pp_refresh_token` и `pp_pin_hash` лежат в `expo-secure-store`
(Keychain/Keystore). В браузере это `localStorage` — читается любым JS на origin и на
iOS в standalone вычищается ITP после ~7 дней без открытия.

Решение — **PIN оставляем, но на вебе не храним хэш PIN вообще; PIN становится
реальным фактором.** ✅ Реализовано 2026-09-10.

Как сделано (`mobile/src/auth/`):

- **`vault.ts` / `vault.web.ts`** — платформенный сплит секретов сессии с общим
  интерфейсом (`getRefreshToken`, `saveRefreshToken`, `savePin`, `verifyPin`, `hasPin`,
  `hasStoredSession`, `clearVault`, `MAX_PIN_ATTEMPTS`). `session.ts` их реэкспортит —
  экраны (`otp`, `pin`, `pin-setup`, `profile`) и `api/client.ts` платформу не различают.
- **`vault.ts` (нативный)** — байт-в-байт прежнее поведение: refresh открытым в
  secure-store, PIN — `SHA-256(deviceId:pin)`. Перенесено из `session.ts` без изменений.
- **`vault.web.ts`** — `savePin(pin)`: `PBKDF2-SHA256(pin, salt(16), 210 000)` через
  `crypto.subtle` → ключ `AES-GCM-256`, им шифруем refresh-токен; в `localStorage`
  только блоб `{v, salt, iv, iterations, ct}` (base64) — ни токена, ни хэша PIN.
  `verifyPin(pin)`: деривация → `AES-GCM.decrypt`; тег не сошёлся → жжём попытку
  (`pp_pin_attempts`), после `MAX_PIN_ATTEMPTS` — `signOut` → OTP. Расшифрованный
  токен и ключ живут только в памяти вкладки.
- **До установки PIN** (онбординг) refresh-токен на вебе держится **только в памяти**:
  перезагрузка вкладки до `pin-setup` → на диске ничего → `bootstrapSession` даёт
  `signedOut`, вход по OTP заново. Осознанный компромисс: плейнтекста на диске нет
  никогда (записано в Рисках).
- **`device.ts`** — `getDeviceId` вынесен в лист-модуль (им пользуются и `session`,
  и `vault` — без цикла).
- `access-JWT` — как и на нативе, только в памяти.

Проверено: Node-WebCrypto репро алгоритма — round-trip верным PIN, отказ по неверному
PIN (GCM-тег), в блобе нет плейнтекста, деривация ~29 мс (натив); headless-Chrome —
веб-бандл грузится, `crypto.subtle` доступен, регрессий загрузки нет; в веб-бандле
нет `pp_pin_hash`/нативного `vault.ts`. Юнит-тесты `vault.web` — см. этап 6 (в проекте
`mobile` jest не заведён).

Итерации PBKDF2 (210k) — защита в глубину: 4-значный PIN всё равно перебирается за
10⁴ попыток, но дамп блоба без вычислений бесполезен. Число едет в блобе — поднять
позже можно без поломки старых.

Обязательно на аудит `security-auditor`: токен-at-rest на вебе, CSP-заголовок,
поведение при вычистке хранилища (тихий разлогин → OTP заново, без потери данных).

## Аналитика

**Не применимо.** `DailyMetric`, EWMA/ACWR/Readiness не затрагиваются — клиент читает те
же готовые значения через тот же API.

## Мобильный клиент

Сделано на этапах 1–2 (всё под `.web.tsx` или платформенную ветку, нативное поведение
без изменений):

```
mobile/app.json                     ✅ web.output static → single; web.name/lang/description
mobile/public/index.html            ✅ кастомный шаблон веб-документа: viewport-fit=cover,
                                       <link rel=manifest>, apple-mobile-web-app-capable,
                                       mobile-web-app-capable, status-bar-style=black-translucent,
                                       apple-mobile-web-app-title, apple-touch-icon,
                                       theme-color #0A0D13, тёмный фон в expo-reset.
                                       %LANG_ISO_CODE%/%WEB_TITLE% оставлены — их
                                       подставляет Expo
mobile/public/manifest.json         ✅ name/short_name, start_url "/", scope "/",
                                       display standalone, orientation portrait,
                                       background/theme_color #0A0D13, icons 192/512/maskable
mobile/public/icons/                ✅ из assets/images/icon.png через sips:
                                       apple-touch-icon.png 180 (непрозрачная),
                                       icon-192, icon-512, icon-maskable-512 (арт 80% на #0A0D13)
mobile/src/components/TimeField.web.tsx   ✅ <input type="time"> вместо @expo/ui
                                          datetime-picker (нативный модуль, ломал бандл)
mobile/src/components/FoodScanner.tsx / .web.tsx  ✅ сканер вынесен из food-add.tsx в
                                          свой компонент; .web = ручной ввод штрихкода
                                          (тот же useLookupBarcode), без expo-camera
mobile/src/app/food-add.tsx         ✅ вместо локального Scanner — <FoodScanner/>,
                                       убран импорт expo-camera
mobile/src/theme/index.ts / tokens.ts / provider.tsx   ✅ токены → tokens.ts (разрыв
                                          цикла), шрифтовый фолбэк для web через
                                          process.env.EXPO_OS
mobile/src/api/branding.ts          ✅ импорт defaultTheme из @/theme/tokens
mobile/src/app/_layout.tsx          ✅ на вебе не держим null до загрузки шрифтов
mobile/src/i18n/{ru,en,es}.ts       ✅ nutrition.barcode{ManualHint,Label,Lookup}

mobile/src/auth/vault.ts / vault.web.ts / device.ts   ✅ этап 5 — сплит секретов
                                       сессии; web = PBKDF2+AES-GCM обёртка refresh-токена,
                                       PIN-хэш не хранится; session.ts реэкспортит,
                                       экраны не тронуты
mobile/babel.config.js, jest.config.js, jest.setup.js  ✅ этап 6 — jest-expo/node
mobile/src/auth/vault.web.test.ts, session.test.ts     ✅ этап 6 — 19 тестов, make test зелёный

ещё не сделано:
mobile/src/i18n/*                    подсказка «поставить на домашний экран» + где её показывать
```

Состояния: пустые/ошибки экранов уже есть. Дополнительно — веб-подсказка про установку
(где живёт — см. открытые вопросы). Три локали обязательны.

Проверить в браузере **каждый** маршрут (не только главную): `(auth)` весь флоу,
`(tabs)` для игрока и для staff, модалки (`wellness`, `rpe`, `invite`, `event/[id]`,
`cycle`, `food-*`, `privacy`/`terms`). Цель — ни одного «красного экрана» от нативных
модулей.

## Персональные и медицинские данные

- Новых сущностей и согласий (`DataConsent`) нет — те же экраны, тот же бэкенд.
- В аудит-лог ничего нового не пишем.
- Не логировать: refresh-токен и его шифртекст, PIN, содержимое `localStorage`.
- Риск утечки токена в браузере снижается решением из «Прав доступа» (шифрование
  PIN-производным ключом) + узкий CSP на своём origin без сторонних скриптов.

## Выкатка

- **Фича-флаг не нужен.** Веб-сборка — отдельный артефакт: собран и выложен на домен
  или нет. Рантайм-флага `FEATURE_*` не заводим.
- **Совместимость мобильного клиента.** Нативные APK/сборки не затрагиваются: все
  правки под веб-ветку/`.web.tsx`. Регресс нативного — только через общий слой
  `auth/*`, поэтому там ветвление строго по `Platform.OS`.
- **Порядок обязателен:** API доступен по HTTPS под `app.player-pro.ru/api/` →
  веб-бандл собирается с этим `EXPO_PUBLIC_API_URL` → хостинг+TLS. Пока API только по
  HTTP, установочный PWA невозможен (mixed content). CORS не участвует (same-origin).
- Старых данных у веб-доставки нет.

## Хостинг и nginx

Отвечает на вопрос «nginx — это веб-прокси?»: **для статики PWA — нет.** Для веба nginx —
файловый сервер (`root /srv/web`, `try_files $uri /index.html`); проксируется только
`/api/`, `/ws`, `/health`, `/static/`, `/docs`.

```
                          ┌────────────────────────── nginx (контейнер) ──────────────┐
https://app.player-pro.ru │  /api/  /ws  /health  /static/  /docs  → api:8000          │
                          │  всё остальное  → /srv/web,  try_files $uri /index.html    │
                          └──────────────────────────────────────────────────────────┘
  player-pro.ru        — сайт-визитка, отдельно
  api.player-pro.ru    — опционально, чистый прокси для не-браузерных клиентов
```

Конфиг и compose — в репозитории (реализовано, этап 4):

- **`infra/nginx/playerpro.conf`** — `server_name app.player-pro.ru`, :80. `resolver
  127.0.0.11` + `set $api "http://api:8000"` (nginx стартует, даже если контейнер `api`
  недоступен — literal-host в `proxy_pass` иначе роняет старт). Иммутабельный кэш
  `/_expo/`, `/assets/`; `no-cache` для `index.html`/`manifest.json`; `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options` (CSP — этап 7). `nginx -t` проходит.
- **`infra/docker-compose.stand.yml`** — один файл на стенд и на прод. Добавлен сервис
  `nginx` под профилем `web` (`COMPOSE_PROFILES=web` в `infra/.env`) + bind-mount
  `./web:/srv/web:ro` + тома `certbot_conf`/`certbot_webroot` + `avatar_data`. Порт
  `api:8000` оставлен открытым — прямой адрес нужен текущему Android-APK, пока он не
  перевыпущен на `https://app.player-pro.ru`. `compose config` валиден с профилем и без.
  Отдельного `docker-compose.prod.yml` не заводим.
- **`infra/web/`** — сюда `rsync`-ается `mobile/dist/`; в git не коммитится.

Механика выкладки и переезд на TLS (443-блок, sslip.io / HTTP-fallback) — `docs/deploy.md`,
шаги 4b и 5. Переезд API безболезненный: роутер уже на `/api/v1` (`APIRouter(prefix=…)`),
nginx проксирует `/api/` как есть, переписывать путь не нужно.

## Этапность

1. ✅ **Веб-бандл собирается и работает.** `output: single`; `.web`-фолбэки
   (`TimeField.web.tsx` → `<input type="time">`, `FoodScanner.web.tsx` → ручной ввод
   штрихкода); шрифтовый фолбэк в теме через `process.env.EXPO_OS`. `npx expo export
   --platform web` без ошибок; headless-Chrome: приложение грузится, auth-гейт уводит
   на `/welcome`, консоль без исключений; `@expo/ui` и `expo-camera` в веб-бандл не
   попадают. Побочно исправлен предсуществовавший circular-import `theme/index.ts` ⇄
   `theme/provider.tsx` (см. «Решения»).
2. ✅ **PWA-оболочка.** `public/index.html` (кастомный шаблон: `viewport-fit=cover`,
   `apple-mobile-web-app-*`, `<link rel=manifest>`, `apple-touch-icon`, тёмный фон для
   первого кадра), `public/manifest.json` (`display: standalone`, portrait, `#0A0D13`),
   `public/icons/` (apple-touch 180 непрозрачная, 192, 512, maskable-512 — из
   `assets/images/icon.png` через `sips`). В `dist/` всё это лежит по корню.
   Осталось: проверить «На экран Домой» на реальном iPhone (этап 6).
3. ✅ **Бэкенд.** Оказалось почти no-op: роутер уже смонтирован на `/api/v1`
   (`APIRouter(prefix="/api/v1")`), клиент уже шлёт `${API_URL}/api/v1…`. nginx просто
   проксирует `/api/` на `api:8000` без переписывания пути. CORS не трогаем (same-origin).
   `X-Forwarded-Proto` прокидывается в `playerpro.conf` — проверка доверия на стороне
   FastAPI остаётся на этап 7/QA.
4. ✅ **Хостинг.** Файлы в репозитории:
   - `infra/nginx/playerpro.conf` — `server_name app.player-pro.ru` :80; `resolver`
     127.0.0.11 + `set $api` (nginx стартует, даже если контейнер `api` лежит);
     proxy на `/api/`, `/ws`, `/health`, `/static/`, `/docs`, `/openapi.json`; статика
     `/srv/web` c `try_files $uri /index.html`; иммутабельный кэш `/_expo/` и `/assets/`,
     `no-cache` для `index.html`/`manifest.json`; базовые security-заголовки (CSP — этап 7).
     `nginx -t` проходит.
   - `infra/docker-compose.stand.yml` — сервис `nginx` под профилем `web`, bind-mount
     `./web:/srv/web:ro`, тома `certbot_conf`/`certbot_webroot`/`avatar_data`. Порт
     `api:8000` оставлен открытым для текущего APK. `compose config` валиден с профилем и без.
   - `infra/web/.gitkeep` + `.gitignore` на `infra/web/*` — бандл кладётся на ВМ, не в git.
   - `docs/deploy.md` переписан: один compose-файл + профиль `web` (`COMPOSE_PROFILES=web`
     в `infra/.env`), same-origin `app.player-pro.ru`, новый **шаг 4b** (export → `rsync`
     в `infra/web/`), шаг 5 — точный 443-блок и sslip.io/HTTP-fallback, порт 8000 в SG
     временно открыт для APK, чек-лист с веб- и iOS-пунктами.
   - Осталось (на ВМ, руками): DNS `app.player-pro.ru` → IP, `certbot` для сертификата,
     первая выкладка бандла.
5. ✅ **Auth на вебе.** `vault.ts`/`vault.web.ts`/`device.ts`: PIN → PBKDF2-SHA256
   (210k, `crypto.subtle`) → AES-GCM обёртка refresh-токена; PIN-хэш на вебе не
   хранится; счётчик попыток и откат на OTP; нативный путь перенесён без изменений
   поведения. tsc/lint чисто, Node-репро алгоритма и headless-boot зелёные.
6. 🟡 **Тесты + QA на iOS.**
   - ✅ Заведён jest: `jest-expo` (~57), пресет `jest-expo/node`, `babel.config.js`
     (`babel-preset-expo` — Metro брал его по умолчанию, babel-jest требует явно),
     `jest.setup.js` (полифилл `crypto`/`btoa`/`atob` для node-sandbox),
     `package.json` `test: jest`.
   - ✅ `src/auth/vault.web.test.ts` — 13 тестов: токен только в памяти до PIN;
     `savePin` шифрует (в блобе нет плейнтекста, форма верна); «перезагрузка» через
     `jest.resetModules` → блоб остаётся, память чиста; верный PIN восстанавливает
     токен; юникод round-trip; счётчик попыток 4→3→…→0; сброс счётчика на успехе;
     `verifyPin` без блоба → `MAX_PIN_ATTEMPTS`; смена PIN (старый отвергнут);
     `clearVault` стирает всё.
   - ✅ `src/auth/session.test.ts` — 6 тестов: `bootstrapSession` (нет сессии →
     `signedOut`; сессия+PIN → `locked`; сессия без PIN → `onboarding`; сбой
     хранилища → `signedOut`); `clearSession`/`signOut` зовут `clearVault`.
   - `make test` (mobile) зелёный — 19/19.
   - ⬜ Осталось: «На экран Домой» на реальном iPhone; полные флоу по ТЗ в Safari +
     установленном PWA (auth-гейт, wellness, RPE, дашборд), 3 локали, пустые/ошибочные
     состояния; замер времени PBKDF2 на iPhone.
7. **security-auditor.** Токен-at-rest на вебе, CSP-заголовок в nginx, вычистка хранилища.
8. **code-reviewer.** Ревью диффа целиком.

## Декомпозиция

```
1. [python-senior]     app.json (output single + web-поля), +html.tsx, manifest.json,
                       TimeField.web, food-add web-ветка, шрифтовый фолбэк
                       → expo export --platform web ок; все маршруты рендерятся в браузере
2. [design/assets]     иконки из icon.png: apple-touch-180 (непрозрачная), 192, 512,
                       maskable-512 в mobile/public/icons/
                       → размеры и прозрачность верные, manifest на них ссылается
3. ✅ [python-senior]  бэкенд уже на /api/v1 (APIRouter prefix) — кода не потребовалось;
                       nginx проксирует /api/ как есть
4. ✅ [devops]         infra/nginx/playerpro.conf + nginx-сервис (профиль web) в
                       infra/docker-compose.stand.yml + infra/web/ + переписан
                       docs/deploy.md (шаг 4b: export → rsync)
                       → nginx -t ок; compose config валиден с профилем и без; на ВМ
                         остаются DNS + certbot + первая выкладка
5. ✅ [python-senior]  auth/vault.ts + vault.web.ts + device.ts: PBKDF2+AES-GCM обёртка
                       refresh-токена, счётчик попыток, откат на OTP; session.ts реэкспортит
                       → неверный PIN не расшифровывает (проверено Node-репро); tsc/lint чисто
6. ✅ [tester]         jest заведён (jest-expo/node + babel.config.js + jest.setup.js);
                       vault.web.test.ts (13) + session.test.ts (6)
                       → make test зелёный, 19/19. Осталось: iOS-QA на устройстве
7. [security-auditor]  токен-at-rest на вебе, CSP-заголовок в nginx,
                       путь при вычистке ITP-хранилища
8. [code-reviewer]     весь дифф: слои, Platform-ветвление, отсутствие регресса нативного
```

Порядок по зависимостям: сборка (1–2) до хостинга (4); API за HTTPS-префиксом (3) до
установочного PWA; auth-ветка (5) до тестов (6) и аудита (7).

## Риски

- **Mixed content.** HTTPS-страница не обратится к HTTP-API — весь PWA не заработает.
  Митигация: same-origin (API за тем же `https://app.player-pro.ru`), TLS до первой
  выкладки бандла.
- **Вычистка хранилища на iOS standalone** (ITP, ~7 дней без открытия) → тихий разлогин,
  вход по OTP заново. Для приложения с ежедневным опросом активный пользователь заходит
  часто — вероятность низкая. Документировать в подсказке про установку.
- **Перезагрузка вкладки на вебе до установки PIN** (в онбординге) → refresh-токен был
  только в памяти → `signedOut`, вход по OTP заново. Осознанно: плейнтекста токена на
  диске нет никогда. Окно узкое (шаги имя/организация/согласие/PIN).
- **Скрытые нативные зависимости ломают бандл** (`@expo/ui` уже такой). Митигация:
  smoke-проход по **всем** маршрутам, а не по главной.
- **Штрихкод-сканер на iOS-вебе недоступен** (`BarcodeDetector`). Nutrition за
  фича-флагом — деградация до ручного ввода приемлема.
- **Нет push на iOS-вебе** (web push только для установленного PWA, iOS 16.4+, с
  ограничениями). Напоминания о ежедневном опросе на вебе не сработают — продуктовый
  разрыв против нативного клиента. Возможный обход — email-напоминание с бэкенда
  (см. открытые вопросы).
- **Отсутствие промпта установки на iOS.** Пользователь не увидит «Install» —
  нужна явная внутренняя инструкция (кнопка Поделиться → «На экран Домой»).
- **Размер бандла / первый рендер `react-native-web`** по мобильной сети, мелькание
  шрифтов. Перф-проход — после MVP (кэш-заголовки, возможно SW).
- **PBKDF2 в главном потоке** при разблокировке — 210k итераций, ~29 мс на десктопе
  (Node). На слабом телефоне-браузере ожидаемо ×3–5 — в пределах разумного для
  одноразовой операции разблокировки. Замерить на реальном iPhone (этап 6); число
  в блобе, снизить/поднять без миграции.

## Открытые вопросы

- Поддомен `app.player-pro.ru` подтверждён (2026-09-10); апекс `player-pro.ru` — под
  визитку, отдельно. Открыто: поднимаем ли сразу опциональный `api.player-pro.ru` для
  нативных клиентов.
- ~~Переезд API на префикс `/api/`~~ — не требуется: роутер уже
  `APIRouter(prefix="/api/v1")`, клиент уже шлёт `/api/v1/…`, nginx проксирует `/api/`
  как есть.
- ~~Держать ли старый `http://81.26.191.107:8000` живым~~ — решено 2026-09-10: да.
  Порт `api:8000` в compose открыт и с nginx, порт 8000 в SG открыт временно. Закрыть,
  когда Android-APK перевыпущен с `EXPO_PUBLIC_API_URL=https://app.player-pro.ru`.
- Доставка `mobile/dist/` на ВМ — по умолчанию `rsync` вручную (в `docs/deploy.md`,
  шаг 4b); CI-джоба — позже.
- Минимальный service worker сейчас (быстрый перезапуск, app-shell кэш) или отложить.
- ~~Глубина auth-харднинга~~ — решено 2026-09-10: PBKDF2+AES-GCM обёртка refresh-токена
  (`vault.web.ts`), плоский `localStorage`-фолбэк для секретов не используется.
- Где живёт подсказка «поставить на домашний экран» (welcome? профиль? одноразовый
  баннер после логина?) и её текст для трёх локалей.
- Напоминания о ежедневном опросе на вебе без push: только внутри приложения или
  email-напоминание с бэкенда.
- Точный список маршрутов для обязательного QA-прохода и матрица ролей (игрок / staff).

---

## Будущий этап (вне объёма этого плана): нативный iOS-билд

Фиксируем, что понадобится, чтобы не собирать по памяти:

- **Apple Developer Program** (99 $/год) — учётка организации, App ID `pro.player.app`
  (уже в `mobile/app.json` `ios.bundleIdentifier`).
- **`mobile/eas.json`** — добавить `ios` в профили `preview`/`production`
  (`simulator` для внутренних, `distribution: store` для релиза), при необходимости
  `credentialsSource`.
- **EAS credentials** — сертификат дистрибуции и provisioning profile (EAS умеет
  генерировать сам при наличии Apple-логина).
- **Capabilities** — камера (`NSCameraUsageDescription` уже задан через `expo-camera`
  плагин), фото (`expo-image-picker` плагин), push (`expo-notifications` — сейчас
  даже не в зависимостях, добавить когда дойдём до пушей).
- **`ITSAppUsesNonExemptEncryption`** — проставить `ios.config.usesNonExemptEncryption:
  false` в `app.json` (обычный HTTPS не считается).
- **Сборка**: `eas build --platform ios --profile production` (в облаке EAS — локальный
  Xcode/симулятор не требуется).
- **Публикация**: `eas submit --platform ios` → TestFlight → ревью App Store.
- Веб-PWA и нативный клиент используют один и тот же бэкенд и один `EXPO_PUBLIC_API_URL`
  на HTTPS-домене — раздваивать API не нужно.
