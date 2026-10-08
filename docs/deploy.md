# Деплой: бэкенд + веб-PWA на Yandex Cloud + APK для Android

Целевая конфигурация первого стенда (UAT): **одна ВМ в Yandex Cloud**, на ней в Docker
Compose — `nginx` → `api` (FastAPI) → `postgres` + `redis`, плюс `worker` и `beat`
(Celery: пересчёт `DailyMetric`, `docs/plan-celery-recalc.md`).

Один поддомен `app.player-pro.ru`, **same-origin**: nginx отдаёт статику веб-PWA
(Expo `output: single`, `docs/plan-web-pwa.md`) и проксирует `/api/`, `/ws`, `/health`,
`/static/` на `api:8000`. Браузер не ходит cross-origin → CORS не нужен, mixed content
невозможен. Мобильный APK собирается через EAS Build и ходит на тот же адрес.

Второй поддомен `admin.player-pro.ru` — кабинет тренера/врача (`docs/plan-web-admin.md`,
`web/`), отдельный Next.js-сервер (не статика), сервис `admin` в том же compose. Это
**BFF**: браузер ходит только на `admin.player-pro.ru`, сам `admin` обращается к `api`
по внутренней docker-сети (`API_URL=http://api:8000`) — CORS тут тоже не нужен, браузер
никогда не видит `api` напрямую.

Апекс `player-pro.ru` — сайт-визитка (`landing/index.html`), третий `server_name` в
том же nginx, что и остальные два домена. В отличие от `app.`/`admin.` — чистая
статика без бэкенда: один файл, собирать нечего, `landing/` коммитится в git как
обычный исходник (не build-артефакт вроде `infra/web/`), обновление — `git pull` на
сервере.

> Один compose-файл на стенд и на прод: `infra/docker-compose.stand.yml`. Разница —
> профиль: без него (`make stand-up`) поднимается только бэкенд, API на `:8000`
> напрямую; с `COMPOSE_PROFILES=web` в `infra/.env` добавляется `nginx` (`:80`/`:443`)
> и раздача статики веб-PWA. Порт `api:8000` остаётся открытым и с nginx — прямой
> адрес нужен текущему Android-APK, пока он не перевыпущен на `https://app.player-pro.ru`.
> Окружение — `infra/.env`, `DEBUG=false`, коды входа — почтой через Postbox
> (`OTP_EMAIL_CHANNEL=email`, `docs/smtp.md`).

## Открытые решения

| Решение | Варианты | По умолчанию в этом документе |
|---|---|---|
| Домен и TLS | поддомен `app.player-pro.ru` + Let's Encrypt · sslip.io по IP · HTTP по IP (демо) | поддомен + Let's Encrypt; sslip.io и HTTP-only — в шаге 5 |
| `api.player-pro.ru` | нет (браузер и APK ходят на `app.player-pro.ru`) · отдельный поддомен чистого прокси | нет; поднимать только если нужен «красивый» адрес API для не-браузерных клиентов |
| Postgres | контейнер на той же ВМ · Managed Service for PostgreSQL | контейнер (для UAT); managed — когда появятся реальные данные |
| Redis | контейнер · Managed Service for Redis | контейнер |

Managed-сервисы дают бэкапы и отказоустойчивость из коробки, но стоят денег и требуют
отдельной подсети/SG. Для голого UAT-стенда это преждевременно.

---

## Шаг 1. Файлы деплоя и окружение

Всё уже в репозитории:

| Файл | Что |
|---|---|
| `backend/Dockerfile` | один образ для `api` / `worker` / `beat` / `migrate` (команда задаётся в compose) |
| `web/Dockerfile` | образ кабинета тренера/врача — многоступенчатая сборка, `output: "standalone"` (`web/next.config.ts`), в финальном слое только минимальный сервер, не весь `node_modules` |
| `infra/docker-compose.stand.yml` | postgres · redis · migrate (Alembic → head, одноразовый) · api (healthcheck, `:8000` наружу) · worker · beat · admin (кабинет, свой образ); `nginx` — под профилем `web` |
| `infra/nginx/playerpro.conf` | `server_name app.player-pro.ru`, :80. Проксирует `/api/`, `/ws`, `/health`, `/static/`, `/docs`; всё остальное — статика `/srv/web` с SPA-фолбэком `try_files $uri /index.html`. TLS добавляется в шаге 5 |
| `infra/nginx/admin.conf` | `server_name admin.player-pro.ru`, :80. Всё проксируется на `admin:3000` — статики тут нет, кабинет полностью динамический. TLS — шаг 5 |
| `infra/nginx/landing.conf` | `server_name player-pro.ru`, :80. Чистая статика `/srv/landing`, без проксирования — у сайта-визитки нет бэкенда. TLS — шаг 5 |
| `infra/nginx/templates/` | `*-tls.conf`-варианты всех трёх доменов — не загружаются nginx'ом (только `infra/nginx/*.conf` без подпапок монтируется в `conf.d`), копируются поверх активного файла вручную **после** выпуска сертификата (шаг 5) |
| `infra/web/` | каталог со статикой веб-PWA; nginx монтирует `:ro`, содержимое кладётся шагом 4b (в git не коммитится) |
| `landing/` | исходник сайта-визитки (`index.html`, один файл, без сборки); nginx монтирует `../landing:/srv/landing:ro`, обновление — `git pull` (в отличие от `infra/web/` коммитится в git как обычный код) |

### `infra/.env` (не коммитить)

Копия `infra/.env.example`, заполненная прод-значениями:

```bash
cp infra/.env.example infra/.env
# затем отредактировать:
```

```dotenv
POSTGRES_PASSWORD=<openssl rand -hex 32>
SECRET_KEY=<openssl rand -hex 32>
DEBUG=false

# Включает nginx + раздачу веб-PWA. Без него поднимается только бэкенд (локальный стенд).
COMPOSE_PROFILES=web

# OTP почтой через Postbox (docs/smtp.md). log — код только в логах, для пользователей не годится.
OTP_EMAIL_CHANNEL=email
SMTP_HOST=postbox.cloud.yandex.net
SMTP_PORT=587
SMTP_USER=<id API-ключа сервисного аккаунта>
SMTP_PASSWORD=<секрет API-ключа>
SMTP_FROM=PlayerPro <noreply@player-pro.ru>

# same-origin: браузер не ходит cross-origin, значение справочное
CORS_ORIGINS=["https://app.player-pro.ru"]
```

Порты Postgres (5434) и Redis наружу не выводятся; `api:8000` открыт (нужен текущему
APK). На публичной ВМ security group всё равно пускает только 22/80/443 — см. шаг 2.

---

## Шаг 2. ВМ в Yandex Cloud

Профиль `yc` уже настроен (`yc config list` — cloud/folder/zone). Статический адрес,
чтобы APK не пришлось пересобирать при пересоздании ВМ:

```bash
yc vpc address create --name playerpro-ip --external-ipv4 zone=ru-central1-b
yc vpc address get playerpro-ip --format json | jq -r .external_ipv4_address.address

yc compute instance create \
  --name playerpro-api \
  --zone ru-central1-b \
  --platform standard-v3 \
  --cores 2 --memory 4 \
  --create-boot-disk image-folder-id=standard-images,image-family=ubuntu-2404-lts,type=network-ssd,size=30 \
  --network-interface subnet-name=default-ru-central1-b,nat-address=ВЫДАННЫЙ_IP \
  --ssh-key ~/.ssh/id_ed25519.pub
```

Если в фолдере используются security groups — открыть 22/80/443 и временно 8000:

```bash
yc vpc security-group create --name playerpro-api --network-name default \
  --rule "direction=ingress,port=22,protocol=tcp,v4-cidrs=[ВАШ_IP/32]" \
  --rule "direction=ingress,port=80,protocol=tcp,v4-cidrs=[0.0.0.0/0]" \
  --rule "direction=ingress,port=443,protocol=tcp,v4-cidrs=[0.0.0.0/0]" \
  --rule "direction=ingress,port=8000,protocol=tcp,v4-cidrs=[0.0.0.0/0]" \
  --rule "direction=egress,protocol=any,v4-cidrs=[0.0.0.0/0]"
```

Порт **8000** открыт временно: на нём висит `api` напрямую, туда ходит текущий
Android-APK (`http://81.26.191.107:8000`, `mobile/eas.json`). Закрыть, когда APK
перевыпущен на `https://app.player-pro.ru` и старые сборки выведены из обращения.

Порты 5432/5434 и 6379 наружу не открываются никогда — БД и Redis доступны только из
compose-сети.

## Шаг 3. Подготовка ВМ

```bash
ssh yc-user@ВЫДАННЫЙ_IP

sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # перелогиниться
```

## Шаг 4. Запуск бэкенда

```bash
git clone <repo> ~/player.pro && cd ~/player.pro
cp infra/.env.example infra/.env   # заполнить (шаг 1), в т.ч. COMPOSE_PROFILES=web

docker compose -f infra/docker-compose.stand.yml --env-file infra/.env up -d --build
# COMPOSE_PROFILES=web из .env → поднимется и nginx. migrate накатывает Alembic сам.

curl -s  http://localhost:8000/health    # {"status":"ok"}  — api напрямую (адрес для APK)
curl -s  http://localhost/health         # то же через nginx
curl -sI http://localhost/ | head -1     # 200, если бандл выложен (шаг 4b); иначе 404
```

Дальше все команды — с тем же `-f … --env-file infra/.env` (профиль подхватывается
из `.env`). Или `make stand-up` / `stand-logs` / `stand-ps` — они это уже включают.

Демо-данные (по желанию, для показа дашборда):

```bash
docker compose -f infra/docker-compose.stand.yml --profile seed run --rm seed
```

### Брендинг организации

Тема и герб клуба (`docs/plan-org-branding.md`). Файл герба нужно сначала занести
внутрь контейнера — том `branding_data` с хоста напрямую не виден:

```bash
CO="docker compose -f infra/docker-compose.stand.yml"

# 1. Тема: JSON с цветами (только отличия от продуктовой палитры)
$CO cp themes/rubin.json api:/tmp/theme.json

# 2. Герб: PNG 512×512 с прозрачностью, вписанный в квадрат по длинной стороне
$CO cp crest.png api:/tmp/crest.png

# 3. Заведение: скрипт сам кладёт герб в /app/static/branding/<org_id>.png
$CO exec api python scripts/seed_branding.py \
    --org "ФК Рубин" --file /tmp/theme.json --logo-file /tmp/crest.png
```

Скрипт печатает предупреждения о контрасте — нечитаемые пары лучше увидеть здесь,
чем на экране у игрока. Версия темы поднимается сама, клиенты перечитают её по ней.

Герб лежит в томе `branding_data` и переживает пересборку образа. Если тома нет,
все гербы исчезнут при первом же релизе.

## Шаг 4b. Веб-PWA (`app.player-pro.ru`)

Бандл собирается локально/в CI и выкладывается на ВМ как статика — nginx его раздаёт,
никакой сборки на ВМ. `output: single` → одна `index.html`, клиентская маршрутизация,
SPA-фолбэк уже в `playerpro.conf`.

**Сборка (локально):**

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://app.player-pro.ru npx expo export --platform web
# результат — mobile/dist/ : index.html, manifest.json, icons/, _expo/static/…, assets/
```

`EXPO_PUBLIC_API_URL` вшивается в бандл **на этапе экспорта**. Для same-origin можно и
без него (клиент возьмёт текущий origin), но явно — надёжнее.

**Выкладка на ВМ:**

```bash
rsync -a --delete mobile/dist/ yc-user@ВЫДАННЫЙ_IP:~/player.pro/infra/web/
# nginx монтирует ./web:/srv/web:ro — новые файлы видны сразу, reload не нужен
# (reload нужен только при правке playerpro.conf)
```

**Проверка:**

```bash
curl -sI  https://app.player-pro.ru/                 # 200, text/html
curl -sI  https://app.player-pro.ru/wellness         # 200 — SPA-фолбэк отдал index.html
curl -s   https://app.player-pro.ru/manifest.json    # JSON манифеста
curl -sI  https://app.player-pro.ru/api/v1/branding  # доходит до FastAPI (401/200, не 404 от nginx)
```

Обновление версии веб-PWA = повторить сборку и `rsync`. Хэшированные имена в `_expo/`
дают безопасный кэш; `index.html` и `manifest.json` отдаются с `Cache-Control: no-cache`.

## Шаг 4c. Сайт-визитка (`player-pro.ru`)

Никакой сборки: `landing/index.html` уже в репозитории (клонирован шагом 4), nginx
монтирует его напрямую (`../landing:/srv/landing:ro`, уже в `docker-compose.stand.yml`).
Если на ВМ уже поднят стек с профилем `web` — статика отдаётся сразу после `git pull`,
отдельного шага выкладки нет.

```bash
curl -sI http://localhost/ -H "Host: player-pro.ru"   # 200, text/html
```

Обновление = `git pull` на сервере, `reload` nginx не нужен (контент — volume, не
образ). `reload` нужен, только если менялся сам `landing.conf`.

> Форма заявки (`#contact`) пока декоративная — `onsubmit="return false"`, сабмит
> никуда не уходит. Реальный приём заявок (письмо/бэкенд-эндпоинт) — отдельная
> задача, не блокирует публикацию сайта: контакты (`hello@player-pro.ru`) рабочие.

## Шаг 5. Домен и TLS

Установочный PWA и standalone на iOS **требуют HTTPS**; HTTPS-страница не может ходить
на HTTP-API (mixed content). Поэтому TLS обязателен, вариант «HTTP по IP» — только для
черновой проверки бэкенда без веб-версии.

> **Сертификат — отдельным вызовом на каждый домен, не один SAN на все три.** Каждый
> `infra/nginx/templates/*-tls.conf` жёстко ссылается на свой путь —
> `/etc/letsencrypt/live/app.player-pro.ru/…`, `live/admin.player-pro.ru/…`,
> `live/player-pro.ru/…` — а certbot по умолчанию называет папку в `live/` по
> **первому** домену из `-d`. Выпустишь одним вызовом `-d app.player-pro.ru
> -d admin.player-pro.ru` — сертификат ляжет только в `live/app.player-pro.ru/`, и
> `admin-tls.conf` не найдёт свой файл (nginx не стартует). Объединять в один
> SAN-сертификат можно, но только с явным `--cert-name <домен>` у каждого домена или
> правкой путей во всех трёх `*-tls.conf` — ниже везде расписан более простой путь:
> три независимых вызова `certbot certonly`, `certbot renew` продлит их все разом.

### Шпаргалка: команды по доменам

Имена volume — пример (`playerpro_…`), **сверить реальные** перед первым запуском:
`docker volume ls | grep certbot` (см. врезку выше — ошибиться тут значит получить
`403`/`404` от Let's Encrypt без очевидной причины). Email — свой, `--agree-tos
--no-eff-email` можно убрать, если хочется интерактивного подтверждения.

| Домен | Выпуск сертификата (разово) | Активировать TLS-конфиг |
|---|---|---|
| `app.player-pro.ru` | `docker run --rm -v playerpro_certbot_conf:/etc/letsencrypt -v playerpro_certbot_webroot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d app.player-pro.ru --email you@player-pro.ru --agree-tos --no-eff-email` | `cp infra/nginx/templates/playerpro-tls.conf infra/nginx/playerpro.conf` |
| `admin.player-pro.ru` | `docker run --rm -v playerpro_certbot_conf:/etc/letsencrypt -v playerpro_certbot_webroot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d admin.player-pro.ru --email you@player-pro.ru --agree-tos --no-eff-email` | `cp infra/nginx/templates/admin-tls.conf infra/nginx/admin.conf` |
| `player-pro.ru` | `docker run --rm -v playerpro_certbot_conf:/etc/letsencrypt -v playerpro_certbot_webroot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d player-pro.ru --email you@player-pro.ru --agree-tos --no-eff-email` | `cp infra/nginx/templates/landing-tls.conf infra/nginx/landing.conf` |

После `cp` для любого домена — один общий reload (подхватывает все изменённые
`*.conf` разом, не нужно дёргать трижды):

```bash
docker compose -f infra/docker-compose.stand.yml --env-file infra/.env exec nginx nginx -s reload
```

**Продление — одна команда на все три домена** (отдельные сертификаты, но общий
volume — `certbot renew` обходит их все сам), это и есть то, что стоит положить в
systemd-таймер:

```bash
docker run --rm \
  -v playerpro_certbot_conf:/etc/letsencrypt \
  -v playerpro_certbot_webroot:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot

docker compose -f infra/docker-compose.stand.yml --env-file infra/.env exec nginx nginx -s reload
```

`certbot renew` сам пропускает сертификаты, которым ещё рано продлеваться (не истекают
в ближайшие 30 дней) — безопасно гонять по таймеру хоть раз в сутки.

### Вариант A — поддомен `app.player-pro.ru` (рекомендуемый)

A-запись `app.player-pro.ru` → публичный IP ВМ. Стек уже поднят на :80 (шаг 4), поэтому
ACME-челлендж проходит. Выпуск сертификата webroot-методом:

> **Имя volume зависит от имени compose-проекта** (по умолчанию — от имени каталога, в
> котором лежит `docker-compose.stand.yml`, но его легко переопределить: другой каталог
> клонирования, явный `COMPOSE_PROJECT_NAME`, `-p` у `docker compose`). Ниже — только
> пример `playerpro_certbot_conf`/`playerpro_certbot_webroot`; **сверь настоящее имя**,
> иначе `docker run certbot` запишет challenge-файл не в тот volume, который реально
> смонтирован в `nginx`, и получишь `403`/`404` от Let's Encrypt на ровном месте:
> ```bash
> docker volume ls | grep certbot
> ```

```bash
docker run --rm \
  -v playerpro_certbot_conf:/etc/letsencrypt \
  -v playerpro_certbot_webroot:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d app.player-pro.ru --email you@player-pro.ru --agree-tos --no-eff-email
```

Затем в `infra/nginx/playerpro.conf`: тело текущего `server {}` (всё от `resolver` и
`location`-ов до заголовков безопасности) переносится в новый `server` на 443, а :80
оставляем только под ACME + редирект:

```nginx
server {
    listen 80;
    server_name app.player-pro.ru;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name app.player-pro.ru;

    ssl_certificate     /etc/letsencrypt/live/app.player-pro.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.player-pro.ru/privkey.pem;

    # … сюда: resolver + set $api + proxy_set_header + все location /api/ … /,
    #    заголовки безопасности — без изменений из версии на :80 …
}
```

Применить: `docker compose -f infra/docker-compose.stand.yml exec nginx nginx -s reload`.

Продление — cron/systemd-таймер на ВМ: `certbot renew` (тем же `docker run`) и следом
`docker compose -f infra/docker-compose.stand.yml exec nginx nginx -s reload`.

Если поднимаем ещё и `api.player-pro.ru` (чистый прокси для APK / внешних клиентов):
добавить `-d api.player-pro.ru` в certbot и отдельный `server` на 443 с теми же
`location /api/` и `/ws`, без `location /`.

### Кабинет тренера/врача — `admin.player-pro.ru`

Тот же приём, отдельным доменом. **TLS тут не опционален так же, как для
`app.player-pro.ru`**: сессия — httpOnly-куки с `Secure=true` при
`NODE_ENV=production` (`web/src/lib/cookies.ts`), без HTTPS браузер их не примет
вообще — кабинет не заработает даже по HTTP-заглушке.

1. **DNS** — A-запись `admin.player-pro.ru` → тот же публичный IP ВМ.
2. **Собрать и поднять сервис `admin`** (если ещё не поднят — он под тем же
   профилем `web`, что nginx): `docker compose -f infra/docker-compose.stand.yml
   --env-file infra/.env --profile web up -d --build`. Отдельного `.env`-значения
   ему не нужно — `API_URL=http://api:8000` уже в compose, секретов у кабинета нет:
   пользователь всегда свой (email OTP → опционально пароль, `docs/plan-web-admin-
   password-auth.md`), сервер ничего своего не хранит.
3. **Сертификат** — тем же `docker run certbot/certbot`, что и для `app.player-pro.ru`
   (шаг выше, включая сверку имён volume через `docker volume ls | grep certbot` —
   это тот самый шаг, который проще всего пропустить, а без него будет молчаливый
   `404` на ACME-challenge), но с `-d admin.player-pro.ru`, **отдельным вызовом**
   (см. врезку в начале шага 5 — `admin-tls.conf` ждёт сертификат именно в
   `live/admin.player-pro.ru/`).
4. **Активировать TLS-конфиг**:
   ```bash
   cp infra/nginx/templates/admin-tls.conf infra/nginx/admin.conf
   docker compose -f infra/docker-compose.stand.yml --env-file infra/.env exec nginx nginx -s reload
   ```
5. **Проверка**:
   ```bash
   curl -sI https://admin.player-pro.ru/login   # 200, text/html
   curl -sI https://admin.player-pro.ru/teams   # редирект на /login (нет сессии)
   ```

Продление сертификата — тот же cron/systemd-таймер, что у `app.player-pro.ru`
(шаг выше), `certbot renew` продлевает все домены сертификата разом.

### Сайт-визитка — `player-pro.ru`

Тот же приём, третьим доменом. TLS тут не критичен так же жёстко, как для
`admin.player-pro.ru` (нет cookie-сессии, нет PWA-установки) — но без него браузеры
всё равно помечают сайт «небезопасным», а HSTS с других поддоменов на апекс не
распространяется, так что сертификат нужен в любом случае, просто не блокирует
запуск: лендинг отдаёт контент и на :80.

1. **DNS** — A-запись `player-pro.ru` (апекс, без `www`) → тот же публичный IP ВМ.
2. **Сертификат** — тем же `docker run certbot/certbot`, что и для `app.`/`admin.`
   (см. выше, включая сверку имён volume), с `-d player-pro.ru`, **отдельным вызовом**
   (врезка в начале шага 5 — `landing-tls.conf` ждёт сертификат в
   `live/player-pro.ru/`).
3. **Активировать TLS-конфиг**:
   ```bash
   cp infra/nginx/templates/landing-tls.conf infra/nginx/landing.conf
   docker compose -f infra/docker-compose.stand.yml --env-file infra/.env exec nginx nginx -s reload
   ```
4. **Проверка**:
   ```bash
   curl -sI https://player-pro.ru/   # 200, text/html
   curl -sI http://player-pro.ru/    # 301 → https://
   ```

Продление — тот же cron/systemd-таймер, что у остальных доменов.

### Вариант B — без своего домена

`sslip.io`: `app.<IP>.sslip.io` резолвится в IP, Let's Encrypt выдаёт настоящий
сертификат — вариант A работает как есть, только домен другой. `EXPO_PUBLIC_API_URL`
веб-сборки и `eas.json` — тот же адрес.

Совсем без TLS (`http://IP`) веб-PWA неполноценна (нет service worker, «На экран Домой»
открывает во вкладке) и Android с API 28 требует `"android": { "usesCleartextTraffic": true }`
в `mobile/app.json` — трафик, включая OTP и токены, идёт открытым текстом. Только демо
на пару дней.

---

## Шаг 6. APK для Android

Локальная сборка недоступна (Android SDK не установлен, а для iOS ещё и связка
macOS 14.4.1 / Xcode 15.3 против Expo SDK 57) — собираем в облаке EAS.

`mobile/eas.json`:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_API_URL": "https://app.player-pro.ru" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": { "EXPO_PUBLIC_API_URL": "https://app.player-pro.ru" }
    }
  }
}
```

```bash
cd mobile
eas login
eas build:configure       # один раз, создаёт projectId в app.json
eas build -p android --profile preview
```

По окончании EAS отдаёт ссылку на `.apk` — её можно раздать тестировщикам напрямую.

Важно: `EXPO_PUBLIC_API_URL` вшивается в бандл **на этапе сборки**. Смена адреса
бэкенда = новая сборка APK. Без этой переменной клиент выводит адрес из хоста
dev-сервера Expo (`src/api/client.ts`) — в APK это не работает.

---

## Эксплуатация

**Пересчёт `DailyMetric`.** Вынесен в Celery (`docs/plan-celery-recalc.md`):
- `worker` жуёт очередь: задачи `analytics.recalc_athlete` (ставятся при сабмите
  wellness/RPE) и `analytics.recalc_all` (ночной прогон, ручной запуск);
- `beat` раз в сутки в `NIGHTLY_RECALC_HOUR_UTC` ставит `analytics.recalc_all`. Beat
  переживает рестарт без пропуска суток. Держать **ровно один** контейнер `beat`, иначе
  задача продублируется; `worker` можно масштабировать свободно.
- Требования «один воркер uvicorn» у `api` больше нет.
- `NIGHTLY_RECALC_ENABLED=false` — Beat не регистрирует периодическую задачу; сабмит и
  ручной `POST /analytics/recalc` продолжают работать.
- Если `worker`/`beat` не подняты, метрики молча замирают: сабмиты проходят, `DailyMetric`
  не обновляется. После деплоя стоит дёрнуть `POST /api/v1/analytics/recalc` (админ) и
  проверить `GET /api/v1/analytics/recalc/{task_id}`.

**Обновление версии.**

```bash
cd ~/player.pro && git pull
docker compose -f infra/docker-compose.stand.yml up -d --build   # migrate накатит новые ревизии сам
```

> Если после этого сервис **без своего `build:`** (в первую очередь `nginx`) ведёт себя
> так, будто не видит изменений в своих файлах/томах (новый `.conf` в `infra/nginx/`,
> изменённый `volumes:` в самом compose) — на практике встречалось, что обычный `up`
> его не пересоздаёт. Диагностика:
> ```bash
> docker inspect <контейнер> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
> ```
> Если `Source` не совпадает с ожидаемым (например, указывает на путь другого/старого
> чекаута репозитория) — контейнер создан ещё до последнего изменения `volumes:` и
> просто не был пересоздан. Лечится принудительно:
> ```bash
> docker compose -f infra/docker-compose.stand.yml --env-file infra/.env up -d --force-recreate nginx
> ```

Веб-PWA обновляется отдельно (шаг 4b): пересобрать `mobile/dist/` и `rsync` в
`~/player.pro/infra/web/`. reload nginx не нужен, если `playerpro.conf` не менялся.

**Логи и состояние.**

```bash
docker compose -f infra/docker-compose.stand.yml logs -f api worker beat
docker compose -f infra/docker-compose.stand.yml ps
```

**Бэкап БД** (cron на ВМ, пока Postgres в контейнере):

```bash
docker compose -f infra/docker-compose.stand.yml exec -T postgres \
  pg_dump -U playerpro playerpro | gzip > ~/backups/playerpro-$(date +%F).sql.gz
```

## Чек-лист перед выдачей

- [ ] `DEBUG=false`. В debug-режиме `/auth/otp/request` возвращает код прямо в ответе
      (`app/api/v1/auth.py:23`, `app/services/auth_service.py:68`) — вход становится
      открытым для любого, кто знает телефон/почту.
- [ ] `SECRET_KEY` сгенерирован, а не значение по умолчанию из `.env.example`.
- [ ] Пароль Postgres не `playerpro` (дефолт dev-компоуза).
- [ ] Порты 5432/5434/6379 наружу не проброшены. Порт 8000 (`api` напрямую) открыт
      **временно** для текущего Android-APK — план: перевыпустить APK на
      `https://app.player-pro.ru`, затем закрыть 8000 в SG и убрать `ports` у `api`.
- [ ] `COMPOSE_PROFILES=web` в `infra/.env` — иначе nginx не поднимется, будет только `:8000`.
- [ ] TLS работает, `http://` редиректится на `https://` (или осознанно принят
      вариант B с cleartext — но тогда веб-PWA неполноценна).
- [ ] Миграции применены: `alembic current` совпадает с `alembic heads`
      (сервис `migrate` завершился успешно — `docker compose ... ps -a`).
- [ ] `worker` и `beat` подняты и жуют очередь (`docker compose ... ps`, логи без ошибок
      подключения к Redis). Ровно один `beat`. Иначе пересчёт `DailyMetric` стоит.
- [ ] Решено, что делать со Swagger: `docs_url="/docs"` открыт всем
      (`app/main.py:21`) — на публичном стенде его обычно закрывают.
- [ ] **Веб-PWA:** бандл выложен (`curl -sI https://app.player-pro.ru/` → 200);
      под-маршрут отдаёт `index.html` (`.../wellness` → 200); `/manifest.json` доступен;
      `/api/v1/...` доходит до FastAPI, а не до SPA-фолбэка (не 404 от nginx).
- [ ] **iOS:** на реальном iPhone — «Поделиться → На экран Домой» даёт standalone, свою
      иконку и сплеш; полный флоу (вход по OTP → PIN → wellness/RPE), 3 локали.
- [ ] **Сайт-визитка:** `https://player-pro.ru/` → 200; `http://` редиректит на `https://`
      (после шага 5). Форма заявки декоративная — это осознанно, не баг.

## Что ещё не сделано

- SMS/email-шлюз для OTP: кода в проде никто не получит, пока шлюз не подключён —
  сейчас код только пишется в лог сервера (`app/services/auth_service.py:66`).
- Push-уведомления (раздел 9 ТЗ) — требуют FCM-ключей в EAS; на iOS-вебе push нет вовсе.
- CSP-заголовок в `playerpro.conf` (подобрать под inline-бутстрап Expo) — этап 7
  `docs/plan-web-pwa.md`, аудит security-auditor.
- Service worker для веб-PWA (быстрый перезапуск, app-shell кэш) — отложено, см. план.
- Мониторинг и алерты, ротация логов Docker, автопродление сертификата таймером.
