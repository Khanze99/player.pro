# Деплой: бэкенд на Yandex Cloud + APK для Android

Целевая конфигурация первого стенда (UAT): **одна ВМ в Yandex Cloud**, на ней в Docker
Compose — `nginx` → `api` (FastAPI) → `postgres` + `redis`. Мобильный клиент собирается
в APK через EAS Build и ходит на публичный адрес этой ВМ.

> Статус: `backend/Dockerfile` в репозитории уже есть (его использует тестовый стенд
> `infra/docker-compose.stand.yml`, см. README) — приведённый ниже вариант совпадает с ним.
> `infra/docker-compose.prod.yml` и `infra/nginx/` пока не заведены, их создаёт шаг 1.
>
> Разница стенда и прода: в стенде нет nginx и TLS, API слушает 8000 напрямую и работает
> с `DEBUG=true` (OTP-код возвращается в ответе — иначе на стенд не войти). Прод-конфиг
> ниже добавляет nginx, TLS и `DEBUG=false`.

## Открытые решения

| Решение | Варианты | По умолчанию в этом документе |
|---|---|---|
| Домен и TLS | свой домен + Let's Encrypt · без домена (HTTP по IP) | домен + Let's Encrypt; путь без домена описан в шаге 5 |
| Postgres | контейнер на той же ВМ · Managed Service for PostgreSQL | контейнер (для UAT); managed — когда появятся реальные данные |
| Redis | контейнер · Managed Service for Redis | контейнер |

Managed-сервисы дают бэкапы и отказоустойчивость из коробки, но стоят денег и требуют
отдельной подсети/SG. Для голого UAT-стенда это преждевременно.

---

## Шаг 1. Файлы деплоя

### `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8000
# Один воркер: ночной пересчёт живёт внутри процесса приложения (см. «Эксплуатация»)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `infra/docker-compose.prod.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: playerpro
      POSTGRES_USER: playerpro
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U playerpro"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    # Портов наружу нет: БД доступна только внутри compose-сети

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  api:
    build: ../backend
    env_file: ../backend/.env.prod
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/playerpro.conf:/etc/nginx/conf.d/default.conf:ro
      - certbot_webroot:/var/www/certbot
      - certbot_conf:/etc/letsencrypt
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  certbot_webroot:
  certbot_conf:
```

### `infra/nginx/playerpro.conf`

```nginx
server {
    listen 80;
    server_name _;

    # ACME-челлендж для выпуска и продления сертификата
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket дашборда (раздел 10 ТЗ)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        client_max_body_size 2m;
    }
}
```

После выпуска сертификата (шаг 5) в этот файл добавляется `server` на 443 и редирект с 80.

### `backend/.env.prod` (не коммитить)

```dotenv
DATABASE_URL=postgresql+asyncpg://playerpro:СГЕНЕРИРОВАННЫЙ_ПАРОЛЬ@postgres:5432/playerpro
REDIS_URL=redis://redis:6379/0
OTP_STORE=redis
SECRET_KEY=СГЕНЕРИРОВАННЫЙ_КЛЮЧ
DEBUG=false
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=90
NIGHTLY_RECALC_ENABLED=true
NIGHTLY_RECALC_HOUR_UTC=2
FEATURE_NUTRITION_ENABLED=false
FEATURE_CYCLE_ENABLED=false
# pydantic-settings ждёт JSON-массив
CORS_ORIGINS=["https://api.example.ru"]
```

Секреты: `openssl rand -hex 32` для `SECRET_KEY` и пароля Postgres. Тот же пароль
кладётся в `POSTGRES_PASSWORD` окружения compose (например, в `infra/.env`).

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

Если в фолдере используются security groups — открыть 22/80/443:

```bash
yc vpc security-group create --name playerpro-api --network-name default \
  --rule "direction=ingress,port=22,protocol=tcp,v4-cidrs=[ВАШ_IP/32]" \
  --rule "direction=ingress,port=80,protocol=tcp,v4-cidrs=[0.0.0.0/0]" \
  --rule "direction=ingress,port=443,protocol=tcp,v4-cidrs=[0.0.0.0/0]" \
  --rule "direction=egress,protocol=any,v4-cidrs=[0.0.0.0/0]"
```

Порты 5432 и 6379 наружу не открываются никогда — БД и Redis доступны только из
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
# положить backend/.env.prod и infra/.env (POSTGRES_PASSWORD=...)

docker compose -f infra/docker-compose.prod.yml up -d --build

# Миграции применяются вручную — приложение само не мигрирует (CLAUDE.md)
docker compose -f infra/docker-compose.prod.yml exec api alembic upgrade head

curl -s http://localhost/health   # {"status":"ok"}
```

Демо-данные (по желанию, для показа дашборда):

```bash
docker compose -f infra/docker-compose.prod.yml exec api python scripts/seed_demo.py
```

## Шаг 5. Домен и TLS

### Вариант A — есть домен (рекомендуемый)

A-запись домена → публичный IP ВМ, затем выпуск сертификата webroot-методом:

```bash
docker run --rm \
  -v playerpro_certbot_conf:/etc/letsencrypt \
  -v playerpro_certbot_webroot:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d api.example.ru --email you@example.ru --agree-tos --no-eff-email
```

Затем в `infra/nginx/playerpro.conf` добавить 443-сервер с
`ssl_certificate /etc/letsencrypt/live/api.example.ru/fullchain.pem` (и `privkey.pem`),
на 80 оставить только ACME-локацию и `return 301 https://$host$request_uri`.
Продление — cron/systemd-таймер с `certbot renew` и `docker compose exec nginx nginx -s reload`.

### Вариант B — без домена (только для теста)

Бэкенд отвечает по `http://IP`. Android с API 28 блокирует cleartext-HTTP, поэтому в
`mobile/app.json` придётся включить:

```json
"android": { "usesCleartextTraffic": true }
```

Это ослабляет транспорт: трафик, включая OTP-коды и токены, идёт открытым текстом.
Годится для демо на пару дней, не для пользователей. Промежуточный вариант без покупки
домена — `sslip.io` (`api.<IP>.sslip.io`), под который Let's Encrypt выдаёт настоящий
сертификат, и вариант A работает как есть.

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
      "env": { "EXPO_PUBLIC_API_URL": "https://api.example.ru" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": { "EXPO_PUBLIC_API_URL": "https://api.example.ru" }
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

**Ночной пересчёт.** `_nightly_recalc_loop` (`backend/app/main.py:22`) живёт внутри
процесса API и в `NIGHTLY_RECALC_HOUR_UTC` пересчитывает `DailyMetric` всем атлетам
(ТЗ разделы 10 и 11). Поэтому у `api` **один воркер uvicorn**: с несколькими воркерами
или репликами задача поднимется в каждом процессе и они полезут пересчитывать одно и
то же. Пересчёт идемпотентен, но это лишняя нагрузка на БД. При масштабировании —
выключить флаг у веб-воркеров и вынести пересчёт в отдельный контейнер/cron.
Ещё нюанс: расписание держится на `sleep`, поэтому рестарт уже после часа пересчёта
пропускает сутки — после деплоя в это окно пересчёт стоит дёрнуть руками.

**Обновление версии.**

```bash
cd ~/player.pro && git pull
docker compose -f infra/docker-compose.prod.yml up -d --build api
docker compose -f infra/docker-compose.prod.yml exec api alembic upgrade head
```

**Логи и состояние.**

```bash
docker compose -f infra/docker-compose.prod.yml logs -f api
docker compose -f infra/docker-compose.prod.yml ps
```

**Бэкап БД** (cron на ВМ, пока Postgres в контейнере):

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  pg_dump -U playerpro playerpro | gzip > ~/backups/playerpro-$(date +%F).sql.gz
```

## Чек-лист перед выдачей APK

- [ ] `DEBUG=false`. В debug-режиме `/auth/otp/request` возвращает код прямо в ответе
      (`app/api/v1/auth.py:23`, `app/services/auth_service.py:68`) — вход становится
      открытым для любого, кто знает телефон/почту.
- [ ] `SECRET_KEY` сгенерирован, а не значение по умолчанию из `.env.example`.
- [ ] Пароль Postgres не `playerpro` (дефолт dev-компоуза).
- [ ] Порты 5432/6379 не проброшены наружу, security group разрешает только 22/80/443.
- [ ] `CORS_ORIGINS` — реальные адреса, без `localhost`.
- [ ] TLS работает, `http://` редиректится на `https://` (или осознанно принят
      вариант B с cleartext).
- [ ] Миграции применены: `alembic current` совпадает с `alembic heads`.
- [ ] Решено, что делать со Swagger: `docs_url="/docs"` открыт всем
      (`app/main.py:49`) — на публичном стенде его обычно закрывают.

## Что ещё не сделано

- SMS/email-шлюз для OTP: кода в проде никто не получит, пока шлюз не подключён —
  сейчас код только пишется в лог сервера (`app/services/auth_service.py:66`).
- Push-уведомления (раздел 9 ТЗ) — требуют FCM-ключей в EAS.
- Мониторинг и алерты, ротация логов Docker, автопродление сертификата таймером.
