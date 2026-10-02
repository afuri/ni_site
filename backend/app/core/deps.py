"""Dependencies for dependency injection."""
from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import DBAPIError
from app.core.errors import http_error

from app.core.config import settings
from app.core.metrics import READ_DB_FALLBACK_TOTAL
from app.db.session import SessionLocal, ReadSessionLocal

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
        except DBAPIError as exc:
            await session.rollback()
            code = getattr(exc.orig, "sqlstate", None)
            if code in {"55P03", "40P01", "40001"}:
                raise http_error(409, "transaction_retry_required", details={"retry": True}) from exc
            raise


async def get_read_db(db: AsyncSession = Depends(get_db)) -> AsyncGenerator[AsyncSession, None]:
    if settings.READ_DATABASE_URL:
        session = ReadSessionLocal()
        try:
            await session.execute(text("SELECT 1"))
        except Exception:
            await session.close()
            READ_DB_FALLBACK_TOTAL.inc()
        else:
            try:
                yield session
            finally:
                await session.close()
            return
    # FastAPI caches get_db within the request. Reuse the authorization session
    # instead of waiting for a second connection from the same pool.
    yield db
