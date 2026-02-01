from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad_pool import OlympiadPool, OlympiadPoolItem


class OlympiadPoolsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_pool(self, pool: OlympiadPool) -> OlympiadPool:
        self.db.add(pool)
        await self.db.commit()
        await self.db.refresh(pool)
        return pool

    async def create_items(self, items: list[OlympiadPoolItem]) -> None:
        if not items:
            return
        self.db.add_all(items)
        await self.db.commit()

    async def get_pool(self, pool_id: int) -> OlympiadPool | None:
        res = await self.db.execute(select(OlympiadPool).where(OlympiadPool.id == pool_id))
        return res.scalar_one_or_none()

    async def list_pools(self, subject: str | None, limit: int, offset: int) -> list[OlympiadPool]:
        stmt = select(OlympiadPool)
        if subject:
            stmt = stmt.where(OlympiadPool.subject == subject)
        stmt = stmt.order_by(OlympiadPool.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_active_pool(self, subject: str) -> OlympiadPool | None:
        res = await self.db.execute(
            select(OlympiadPool)
            .where(OlympiadPool.subject == subject, OlympiadPool.is_active.is_(True))
            .order_by(OlympiadPool.id.desc())
        )
        return res.scalar_one_or_none()

    async def activate_pool(self, pool: OlympiadPool) -> OlympiadPool:
        await self.db.execute(
            update(OlympiadPool)
            .where(OlympiadPool.subject == pool.subject)
            .values(is_active=False)
        )
        await self.db.execute(
            update(OlympiadPool)
            .where(OlympiadPool.id == pool.id)
            .values(is_active=True)
        )
        await self.db.commit()
        await self.db.refresh(pool)
        return pool

    async def list_items(self, pool_id: int) -> list[OlympiadPoolItem]:
        res = await self.db.execute(
            select(OlympiadPoolItem)
            .where(OlympiadPoolItem.pool_id == pool_id)
            .order_by(OlympiadPoolItem.position.asc(), OlympiadPoolItem.id.asc())
        )
        return list(res.scalars().all())

    async def list_items_for_pools(self, pool_ids: list[int]) -> list[OlympiadPoolItem]:
        if not pool_ids:
            return []
        res = await self.db.execute(
            select(OlympiadPoolItem)
            .where(OlympiadPoolItem.pool_id.in_(pool_ids))
            .order_by(OlympiadPoolItem.pool_id.asc(), OlympiadPoolItem.position.asc(), OlympiadPoolItem.id.asc())
        )
        return list(res.scalars().all())

    async def list_pool_olympiad_ids(self, pool_id: int) -> list[int]:
        items = await self.list_items(pool_id)
        return [item.olympiad_id for item in items]

    async def get_active_pool_by_olympiad(self, olympiad_id: int) -> OlympiadPool | None:
        res = await self.db.execute(
            select(OlympiadPool)
            .join(OlympiadPoolItem, OlympiadPoolItem.pool_id == OlympiadPool.id)
            .where(
                OlympiadPoolItem.olympiad_id == olympiad_id,
                OlympiadPool.is_active.is_(True),
            )
            .order_by(OlympiadPool.id.desc())
        )
        return res.scalar_one_or_none()
