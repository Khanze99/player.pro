from pydantic_settings import BaseSettings, SettingsConfigDict


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

    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 90
    invite_ttl_days: int = 7

    # Ночной пересчёт DailyMetric
    nightly_recalc_enabled: bool = True
    nightly_recalc_hour_utc: int = 2

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8081"]


settings = Settings()
