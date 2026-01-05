"""Dependencies for dependency injection."""
from typing import AsyncGenerator
from app.db.session import SessionLocal, ReadSessionLocal
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def get_read_db() -> AsyncGenerator[AsyncSession, None]:
    async with ReadSessionLocal() as session:
        yield session
