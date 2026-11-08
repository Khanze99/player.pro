import re

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ревью-аккаунты принимаются только на нашем домене: по ошибке вписанный адрес
# реального человека не должен открываться вечным кодом без доставки.
_REVIEW_EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@player-pro\.ru$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PlayerPro API"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://playerpro:playerpro@localhost:5433/playerpro"
    redis_url: str = "redis://localhost:6379/0"

    # OTP-хранилище: "redis" (по умолчанию) или "memory" (тесты)
    otp_store: str = "redis"
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_requests_per_hour: int = 5

    # Канал доставки OTP: "log" | "email" | "sms" (app/services/notify_service.py).
    # По умолчанию лог: SMS-провайдера нет, SMTP настраивается только в проде.
    otp_email_channel: str = "log"
    otp_phone_channel: str = "log"

    # Ревью-аккаунты для App Store / Google Play / RuStore и наших проверок на проде
    # (docs/plan-legal-texts.md): ревьюер не получит OTP на почту, поэтому для этих
    # адресов код фиксированный и не отправляется. Список через запятую, только
    # адреса @player-pro.ru, код ровно 6 цифр. Оба пустые = механизма нет (дефолт,
    # тесты, локальная разработка). Ошибка в значениях роняет старт приложения, а не
    # вход пользователей.
    review_login_identifiers: str = ""
    review_otp_code: str = ""

    # Yandex Cloud Postbox: логин — ID API-ключа, пароль — его секрет как есть
    # (не статический ключ доступа и без преобразования AWS4).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "PlayerPro <noreply@player-pro.ru>"
    smtp_starttls: bool = True

    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 90
    invite_ttl_days: int = 7

    # Аватары профиля. Каталог обязан быть на примонтированном volume в проде —
    # иначе файлы не переживут релиз (та же история, что со static/branding).
    media_dir: str = "media"
    avatar_max_upload_bytes: int = 5 * 1024 * 1024
    avatar_size_px: int = 512

    # Версия текста согласия на обработку спецкатегорий персданных (152-ФЗ, ст. 10).
    # При изменении текста — поднять версию: старые согласия станут неактуальными
    # и приложение переспросит.
    consent_policy_version: str = "2026-08-08"

    # Версии текстов юридического гейта согласий при регистрации (отдельная фича
    # от DataConsent/consent_policy_version выше — тот про sharing цикла/питания,
    # эти — про ToS и спецкатегорию «здоровье» при онбординге, см.
    # docs/plan-onboarding-consent.md). Пользовательское соглашение + Политика
    # конфиденциальности (152-ФЗ ст. 9) и отдельное согласие на данные о здоровье
    # (152-ФЗ ст. 10) переспрашиваются независимо друг от друга при смене версии.
    # 2026-11-08: редакция с клубом-оператором, полным списком данных, 18+ и удалением
    # аккаунта (docs/plan-legal-texts.md). Значение = «Версия» в шапке
    # landing/privacy.html и landing/terms.html: менять только вместе с ними.
    terms_policy_version: str = "2026-11-08"
    health_consent_policy_version: str = "2026-11-08"

    # Фича-флаги. Обе фичи выключены до готовности юридического текста согласия
    # и продуктового решения по отображению. Код есть и покрыт тестами, но
    # в интерфейсе не появляется. Включать по одному флагу.
    feature_cycle_enabled: bool = False
    feature_nutrition_enabled: bool = False

    # Ночной пересчёт DailyMetric. Прогон ставит Celery Beat (сервис `beat`);
    # nightly_recalc_enabled=false — периодическая задача не регистрируется в расписании.
    nightly_recalc_enabled: bool = True
    nightly_recalc_hour_utc: int = 2

    # Celery: пересчёт DailyMetric в отдельном воркере (docs/plan-celery-recalc.md).
    # Тот же Redis, что и OTP, но другие логические БД (OTP — /0).
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    # Тесты выставляют true + memory-транспорт: .delay() исполняется синхронно.
    celery_task_always_eager: bool = False

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8081"]

    @property
    def review_logins(self) -> frozenset[str]:
        """Нормализованные адреса ревью-аккаунтов (проверены в _check_review_login)."""
        return frozenset(v.strip().lower() for v in self.review_login_identifiers.split(",") if v.strip())

    @model_validator(mode="after")
    def _check_review_login(self) -> "Settings":
        logins, code = self.review_logins, self.review_otp_code
        if bool(logins) != bool(code):
            raise ValueError("REVIEW_LOGIN_IDENTIFIERS и REVIEW_OTP_CODE задаются только вместе")
        if code and not re.fullmatch(r"\d{6}", code):
            raise ValueError("REVIEW_OTP_CODE: ровно 6 цифр")
        bad = sorted(v for v in logins if not _REVIEW_EMAIL_RE.match(v))
        if bad:
            raise ValueError(f"REVIEW_LOGIN_IDENTIFIERS: только адреса @player-pro.ru, не подходят: {bad}")
        return self


settings = Settings()
