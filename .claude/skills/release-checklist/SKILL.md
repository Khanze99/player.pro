---
name: release-checklist
description: "Чек-лист что реально нужно задеплоить после релиза: смотрит diff с прошлого бампа версии (backend/web/mobile/landing/infra) и даёт только применимые шаги с точными командами из docs/deploy.md — не весь чек-лист подряд. Вызывать после коммита релиза, перед выкаткой на стенд."
---

# Чек-лист деплоя релиза

Цель: по факту изменений с прошлого релиза сказать, что из `docs/deploy.md` реально
нужно прогнать сейчас — не весь документ, а только применимые шаги. Это не замена
`docs/deploy.md` (там — как именно каждый шаг устроен), а фильтр поверх него.

## Шаг 1. Диапазон изменений

Найти текущий релиз и предыдущий — оба отмечены коммитами `chore: версия…`:

```bash
git log --oneline --grep="^chore: версия" -n 2
```

Диапазон — `<предыдущий>..HEAD`. Если текущий релиз ещё не закоммичен (версия в
`mobile/app.json` поднята, но коммита `chore: версия` нет) — диапазон
`<предыдущий>..HEAD` всё равно верный, просто релизный коммит ещё впереди.

Если `chore: версия…` коммитов меньше двух (первый релиз в истории) — спросить
пользователя, с какого коммита/даты считать диапазон, не гадать.

## Шаг 2. Что изменилось

```bash
git diff --stat <предыдущий>..HEAD -- backend/ web/ mobile/ landing/ infra/
```

Разнести пути по категориям — именно они определяют, какие шаги ниже применимы:

| Пути | Категория |
|---|---|
| `backend/app/`, `backend/alembic/` | Бэкенд |
| `backend/alembic/versions/*.py` (новые файлы) | + Миграции |
| `web/` | Admin-кабинет |
| `mobile/src/`, `mobile/app.json`, `mobile/assets/` | Mobile/PWA |
| `mobile/app.json` (поле `version` изменилось) | + APK |
| `landing/` | Сайт-визитка |
| `infra/nginx/*.conf`, `infra/docker-compose*.yml` | + nginx force-recreate |

Категория без изменённых файлов в диапазоне — её раздел ниже пропускается целиком,
не печатается «неприменимо» строкой ради строки.

## Шаг 3. Печатать только применимые разделы

### Бэкенд изменился

```bash
cd ~/player.pro && git pull
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env build api
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env up -d
# migrate накатывает Alembic до head сам, см. "+ Миграции" ниже, если есть новые файлы
curl -s https://app.player-pro.ru/health   # {"status":"ok"}
```

Если изменения задели `app/core/calculations.py` или сервисы аналитики — после деплоя
дёрнуть пересчёт и проверить статус (`docs/deploy.md`, «Пересчёт DailyMetric»):

```bash
# POST /api/v1/analytics/recalc (админ) → {"task_id": "..."}
# GET /api/v1/analytics/recalc/{task_id} → status
```

### + Миграции

Проверить `alembic current` совпадает с `alembic heads` после деплоя — сервис `migrate`
в compose применяет их сам при `up`, но стоит убедиться, что он реально завершился
успешно (`docker compose ... ps -a`), а не просто не упал молча.

### Admin-кабинет изменился

```bash
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env build admin
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env --profile web up -d
curl -sI https://admin.player-pro.ru/login   # 200, text/html
```

**Никогда не `up -d --build`** ни в одном разделе. У `migrate`/`api`/`worker`/`beat`/`seed`
один образ `playerpro-backend`, параллельная сборка падает на тегировании
(`AlreadyExists`) и молча оставляет на стенде старую версию. Причина и выход из
застрявшего тега: `docs/deploy.md`, «Эксплуатация» → «Обновление версии».

### Mobile/PWA изменился

Веб-PWA — пересобрать и выложить (`docs/deploy.md`, шаг 4b):

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://app.player-pro.ru npx expo export --platform web
rsync -a --delete mobile/dist/ yc-user@ВЫДАННЫЙ_IP:~/player.pro/infra/web/
curl -sI https://app.player-pro.ru/   # 200
```

### + APK (версия в `mobile/app.json` изменилась)

Новый APK имеет смысл собирать только если версия реально поднята или менялся нативный
код (не каждое изменение `mobile/src/` требует нового билда — PWA этого не ждёт):

```bash
cd mobile
eas build -p android --profile preview
```

`EXPO_PUBLIC_API_URL` зашит в `mobile/eas.json` на этапе сборки — отдельно передавать
не нужно, если адрес бэкенда не менялся.

### Сайт-визитка изменился

Без сборки — `landing/` коммитится как обычный исходник:

```bash
# на сервере: git pull уже подхватывает — если стенд уже поднят с --profile web,
# отдельного шага выкладки нет
curl -sI https://player-pro.ru/   # 200
```

### + nginx force-recreate (менялись `infra/nginx/*.conf` или `volumes:` в compose)

Известная засада (`docs/deploy.md`, «Эксплуатация»): обычный `up` не пересоздаёт
`nginx`, если у него нет своего `build:`, и он может не подхватить новый конфиг/volume:

```bash
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env up -d --force-recreate nginx
```

## Шаг 4. Итог

Показать пользователю получившийся отфильтрованный чек-лист одним блоком (разделы по
шагу 3, в порядке backend → admin → mobile/PWA → APK → лендинг → nginx) — без
дополнительных шагов сверху: только что реально применимо к этому диапазону.
