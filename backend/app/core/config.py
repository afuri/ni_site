"""Application configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_SOCKET_TIMEOUT_SEC: int = 2
    REDIS_CONNECT_TIMEOUT_SEC: int = 2
    OLYMPIAD_TASKS_CACHE_TTL_SEC: int = 300
    CACHE_WARMUP_INTERVAL_SEC: int = 300

    APP_NAME: str = "NI_SITE API"
    ENV: str = "dev"
    APP_VERSION: str = "0.0.0"
    LOG_FORMAT: str = "json"
    OTEL_ENABLED: bool = False
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None
    OTEL_SERVICE_NAME: str | None = None
    OTEL_SAMPLE_RATIO: float = 1.0

    DATABASE_URL: str = "postgresql+asyncpg://postgres:changethis@localhost:5432/ni_site"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT_SEC: int = 30
    DB_POOL_RECYCLE_SEC: int = 1800
    DB_CONNECT_TIMEOUT_SEC: int = 5
    DB_STATEMENT_TIMEOUT_MS: int = 15000

    JWT_SECRET: str = "change_me"
    JWT_SECRETS: str = ""
    JWT_ALG: str = "HS256"
    JWT_ACCESS_TTL_MIN: int = 30
    JWT_REFRESH_TTL_DAYS: int = 30

    EMAIL_BASE_URL: str = "http://localhost:3000"
    EMAIL_FROM: str = "no-reply@example.com"
    EMAIL_FROM_NAME: str | None = None
    EMAIL_VERIFY_TTL_HOURS: int = 24
    PASSWORD_RESET_TTL_HOURS: int = 2
    TEMP_PASSWORD_TTL_HOURS: int = 24
    EMAIL_SEND_ENABLED: bool = False
    EMAIL_PROVIDER: str = "smtp"
    PASSWORD_MIN_LEN: int = 8
    PASSWORD_REQUIRE_UPPER: bool = True
    PASSWORD_REQUIRE_LOWER: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False

    UNISENDER_API_URL: str = "https://go1.unisender.ru/ru/transactional/api/v1/email/send.json"
    UNISENDER_API_KEY: str | None = None

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    TOKEN_CLEANUP_INTERVAL_SEC: int = 3600

    VK_CLIENT_ID: str | None = None
    VK_CLIENT_SECRET: str | None = None
    VK_REDIRECT_URI: str | None = None
    VK_SCOPE: str = "offline,email"

    HTTP_CLIENT_TIMEOUT_SEC: int = 10

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
    AUTH_PASSWORD_CHANGE_RL_LIMIT: int = 5
    AUTH_PASSWORD_CHANGE_RL_WINDOW_SEC: int = 60

    GLOBAL_RL_LIMIT: int = 0
    GLOBAL_RL_WINDOW_SEC: int = 0
    CRITICAL_RL_USER_LIMIT: int = 0
    CRITICAL_RL_USER_WINDOW_SEC: int = 0
    CRITICAL_RL_PATHS: str = "/api/v1/auth/login,/api/v1/auth/refresh,/api/v1/auth/password/change,/api/v1/admin/users"

    SUPER_ADMIN_LOGINS: str = ""
    SERVICE_TOKENS: str = ""

    ADMIN_ACTION_OTP_TTL_SEC: int = 300
    ADMIN_ACTION_OTP_LENGTH: int = 6

    AUDIT_LOG_ENABLED: bool = True
    AUDIT_LOG_RETENTION_DAYS: int = 90
    SENTRY_DSN: str | None = None
    PROMETHEUS_ENABLED: bool = False
    AUDIT_LOG_CLEANUP_INTERVAL_SEC: int = 86400

    STORAGE_ENDPOINT: str | None = None
    STORAGE_BUCKET: str = "ni-site"
    STORAGE_ACCESS_KEY: str | None = None
    STORAGE_SECRET_KEY: str | None = None
    STORAGE_REGION: str = "us-east-1"
    STORAGE_USE_SSL: bool = True
    STORAGE_PUBLIC_BASE_URL: str | None = None
    STORAGE_PRESIGN_EXPIRES_SEC: int = 900
    STORAGE_MAX_UPLOAD_MB: int = 10
    STORAGE_ALLOWED_CONTENT_TYPES: str = "image/jpeg,image/png,image/webp"

    READ_DATABASE_URL: str | None = None
    READ_DB_POOL_SIZE: int = 5
    READ_DB_MAX_OVERFLOW: int = 10


settings = Settings()

DEFAULT_DATABASE_URL = "postgresql+asyncpg://postgres:changethis@localhost:5432/ni_site"
DEFAULT_JWT_SECRET = "change_me"


def validate_required_settings() -> list[str]:
    required = {
        "DATABASE_URL": settings.DATABASE_URL,
        "REDIS_URL": settings.REDIS_URL,
        "JWT_SECRET": settings.JWT_SECRET if settings.JWT_SECRETS == "" else "ok",
        "EMAIL_BASE_URL": settings.EMAIL_BASE_URL,
        "APP_VERSION": settings.APP_VERSION,
    }
    if settings.STORAGE_ENDPOINT:
        required["STORAGE_BUCKET"] = settings.STORAGE_BUCKET
        required["STORAGE_ACCESS_KEY"] = settings.STORAGE_ACCESS_KEY
        required["STORAGE_SECRET_KEY"] = settings.STORAGE_SECRET_KEY
        required["STORAGE_PUBLIC_BASE_URL"] = settings.STORAGE_PUBLIC_BASE_URL
    missing = [key for key, value in required.items() if not value]
    if settings.ENV in {"prod", "stage"}:
        if settings.JWT_SECRETS:
            if any(secret.strip() == DEFAULT_JWT_SECRET for secret in settings.JWT_SECRETS.split(",")):
                missing.append("JWT_SECRET")
        elif settings.JWT_SECRET == DEFAULT_JWT_SECRET:
            missing.append("JWT_SECRET")
        if settings.DATABASE_URL == DEFAULT_DATABASE_URL or ":changethis@" in settings.DATABASE_URL:
            missing.append("DATABASE_URL")
    if missing:
        missing = list(dict.fromkeys(missing))
    return missing
