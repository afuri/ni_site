"""Application configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"
    OLYMPIAD_TASKS_CACHE_TTL_SEC: int = 300

    APP_NAME: str = "NI_SITE API"
    ENV: str = "dev"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:changethis@localhost:5432/ni_site"

    JWT_SECRET: str = "change_me"
    JWT_ALG: str = "HS256"
    JWT_ACCESS_TTL_MIN: int = 30
    JWT_REFRESH_TTL_DAYS: int = 30

    EMAIL_BASE_URL: str = "http://localhost:3000"
    EMAIL_FROM: str = "no-reply@example.com"
    EMAIL_VERIFY_TTL_HOURS: int = 24
    PASSWORD_RESET_TTL_HOURS: int = 2
    EMAIL_SEND_ENABLED: bool = False

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    VK_CLIENT_ID: str | None = None
    VK_CLIENT_SECRET: str | None = None
    VK_REDIRECT_URI: str | None = None
    VK_SCOPE: str = "offline,email"

    # rate limit for saving answers
    ANSWERS_RL_LIMIT: int = 20
    ANSWERS_RL_WINDOW_SEC: int = 10
    SUBMIT_LOCK_TTL_SEC: int = 15

    AUTH_LOGIN_RL_LIMIT: int = 10
    AUTH_LOGIN_RL_WINDOW_SEC: int = 60
    AUTH_REGISTER_RL_LIMIT: int = 5
    AUTH_REGISTER_RL_WINDOW_SEC: int = 60
    AUTH_VERIFY_RL_LIMIT: int = 5
    AUTH_VERIFY_RL_WINDOW_SEC: int = 60
    AUTH_RESET_RL_LIMIT: int = 5
    AUTH_RESET_RL_WINDOW_SEC: int = 60

    AUDIT_LOG_ENABLED: bool = True
    SENTRY_DSN: str | None = None
    PROMETHEUS_ENABLED: bool = False


settings = Settings()
