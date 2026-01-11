from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad import Olympiad


class OlympiadsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, obj: Olympiad) -> Olympiad:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get(self, olympiad_id: int) -> Olympiad | None:
        res = await self.db.execute(select(Olympiad).where(Olympiad.id == olympiad_id))
        return res.scalar_one_or_none()

    async def list(self, created_by_user_id: int | None, limit: int, offset: int) -> list[Olympiad]:
        stmt = select(Olympiad)
        if created_by_user_id is not None:
            stmt = stmt.where(Olympiad.created_by_user_id == created_by_user_id)
        stmt = stmt.order_by(Olympiad.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def list_published(self, limit: int, offset: int) -> list[Olympiad]:
        stmt = (
            select(Olympiad)
            .where(Olympiad.is_published.is_(True))
            .order_by(Olympiad.available_from.desc(), Olympiad.id.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def save(self, obj: Olympiad) -> Olympiad:
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: Olympiad) -> None:
        await self.db.delete(obj)
        await self.db.commit()
