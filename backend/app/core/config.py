"""Application configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"

    APP_NAME: str = "NI_SITE API"
    ENV: str = "dev"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:changethis@localhost:5432/ni_site"

    JWT_SECRET: str = "change_me"
    JWT_ALG: str = "HS256"
    JWT_ACCESS_TTL_MIN: int = 30
    JWT_REFRESH_TTL_DAYS: int = 30

    VK_CLIENT_ID: str | None = None
    VK_CLIENT_SECRET: str | None = None
    VK_REDIRECT_URI: str | None = None
    VK_SCOPE: str = "offline,email"

    # rate limit for saving answers
    ANSWERS_RL_LIMIT: int = 20
    ANSWERS_RL_WINDOW_SEC: int = 10


settings = Settings()
