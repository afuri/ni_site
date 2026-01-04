"""Database session management."""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

connect_args = {"timeout": settings.DB_CONNECT_TIMEOUT_SEC}
if settings.DB_STATEMENT_TIMEOUT_MS > 0:
    connect_args["server_settings"] = {"statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS)}

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT_SEC,
    pool_recycle=settings.DB_POOL_RECYCLE_SEC,
    connect_args=connect_args,
)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
