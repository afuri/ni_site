"""Dependencies for dependency injection."""
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.metrics import READ_DB_FALLBACK_TOTAL
from app.db.session import SessionLocal, ReadSessionLocal

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def get_read_db() -> AsyncGenerator[AsyncSession, None]:
    if settings.READ_DATABASE_URL:
        try:
            async with ReadSessionLocal() as session:
                await session.execute(text("SELECT 1"))
                yield session
                return
        except Exception:
            READ_DB_FALLBACK_TOTAL.inc()
    async with SessionLocal() as session:
        yield session
