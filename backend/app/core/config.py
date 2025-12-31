"""Application configuration."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "NI_SITE API"
    ENV: str = "dev"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:changethis@localhost:5432/ni_site"

    JWT_SECRET: str = "change_me"
    JWT_ALG: str = "HS256"
    JWT_ACCESS_TTL_MIN: int = 30
    JWT_REFRESH_TTL_DAYS: int = 30


settings = Settings()
