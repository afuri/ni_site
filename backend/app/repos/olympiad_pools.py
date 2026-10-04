from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.models.olympiad_pool import OlympiadPool, OlympiadPoolItem
from app.models.olympiad import Olympiad


class OlympiadPoolsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def load_bundle(self, pool_id: int, *, lock: bool | str = False, full: bool = True):
        from app.models.olympiad_task import OlympiadTask
        from app.models.task import Task
        stmt = select(OlympiadPool).where(OlympiadPool.id == pool_id)
        if lock:
            stmt = stmt.with_for_update(read=lock == "share").execution_options(populate_existing=True)
        pool = await self.db.scalar(stmt)
        if pool is None:
            raise ValueError("olympiad_pool_not_found")
        items = await self.list_items(pool_id)
        stmt = select(Olympiad).where(Olympiad.id.in_([item.olympiad_id for item in items])).order_by(Olympiad.id)
        if lock:
            stmt = stmt.with_for_update(read=lock == "share").execution_options(populate_existing=True)
        variants = {value.id: value for value in (await self.db.scalars(stmt)).all()}
        statement = select(OlympiadTask, Task).join(Task, Task.id == OlympiadTask.task_id)
        if not full:
            statement = statement.options(load_only(Task.id, Task.subject))
        rows = (await self.db.execute(statement.where(OlympiadTask.olympiad_id.in_(variants))
                                      .order_by(OlympiadTask.sort_order, OlympiadTask.id))).all()
        compositions = {}
        for link, task in rows:
            compositions.setdefault(link.olympiad_id, []).append((link, task))
        return pool, items, variants, compositions

    async def pool_id_for_variant(self, olympiad_id: int) -> int | None:
        return await self.db.scalar(select(OlympiadPoolItem.pool_id).where(
            OlympiadPoolItem.olympiad_id == olympiad_id).order_by(OlympiadPoolItem.pool_id).limit(1))

    async def lock_variant_for_code_start(self, olympiad_id: int) -> Olympiad | None:
        # Same order as regular admission: pool, then variant. Savepoint rollback
        # releases these locks if pool membership changed while acquiring them.
        # Never require the pool to be active, and never lock sibling variants.
        for _ in range(3):
            savepoint = await self.db.begin_nested()
            try:
                pool_id = await self.pool_id_for_variant(olympiad_id)
                if pool_id is not None:
                    pool = await self.db.scalar(select(OlympiadPool).where(OlympiadPool.id == pool_id)
                                                .with_for_update(read=True))
                    if pool is None:
                        pool_id = None
                olympiad = await self.db.scalar(select(Olympiad).where(Olympiad.id == olympiad_id)
                    .with_for_update(read=True).execution_options(populate_existing=True))
                if await self.pool_id_for_variant(olympiad_id) != pool_id:
                    await savepoint.rollback()
                    continue
                await savepoint.commit()
                return olympiad
            except Exception:
                await savepoint.rollback()
                raise
        raise ValueError("olympiad_not_available")

    async def list_pools(self, subject: str | None, limit: int, offset: int) -> list[OlympiadPool]:
        stmt = select(OlympiadPool)
        if subject:
            stmt = stmt.where(OlympiadPool.subject == subject)
        stmt = stmt.order_by(OlympiadPool.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

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
