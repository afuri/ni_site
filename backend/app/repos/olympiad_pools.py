from __future__ import annotations

from datetime import datetime
from sqlalchemy import and_, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad_pool import OlympiadAssignment, OlympiadPool, OlympiadPoolItem
from app.models.olympiad import Olympiad
from app.models.attempt import Attempt, AttemptStatus


class OlympiadPoolsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _assigned_variants(user_id: int):
        # Rank the COMPLETE pool before publication/grade/time filtering: filtering
        # first would change the established (user_id - 1) % size assignment.
        ranked = select(
            OlympiadPoolItem.pool_id,
            OlympiadPoolItem.olympiad_id,
            func.row_number().over(
                partition_by=OlympiadPoolItem.pool_id,
                order_by=(OlympiadPoolItem.position, OlympiadPoolItem.id),
            ).label("position"),
            func.count().over(partition_by=OlympiadPoolItem.pool_id).label("size"),
        ).where(OlympiadPoolItem.pool_id.in_(
            select(OlympiadPool.id).where(OlympiadPool.is_active.is_(True)),
        )).subquery()
        return (
            select(OlympiadPool, Olympiad)
            .join(ranked, ranked.c.pool_id == OlympiadPool.id)
            .outerjoin(OlympiadAssignment, and_(
                OlympiadAssignment.pool_id == OlympiadPool.id,
                OlympiadAssignment.user_id == user_id,
            ))
            .join(Olympiad, Olympiad.id == ranked.c.olympiad_id)
            .where(
                OlympiadPool.is_active.is_(True),
                or_(
                    OlympiadAssignment.olympiad_id == ranked.c.olympiad_id,
                    and_(
                        OlympiadAssignment.id.is_(None),
                        ranked.c.position == ((user_id - 1) % ranked.c.size) + 1,
                    ),
                ),
            )
        )

    async def list_assigned_available(self, user_id: int, now: datetime) -> list[tuple[OlympiadPool, Olympiad]]:
        completed = select(Attempt.id).where(
            Attempt.user_id == user_id,
            Attempt.olympiad_id == Olympiad.id,
            or_(Attempt.status != AttemptStatus.active, Attempt.deadline_at < now),
        ).exists()
        res = await self.db.execute(self._assigned_variants(user_id).where(
            Olympiad.is_published.is_(True),
            Olympiad.available_to >= now,
            ~completed,
        ).order_by(Olympiad.available_from.asc(), Olympiad.id.asc()))
        return list(res.all())

    async def is_assigned_variant(self, user_id: int, olympiad_id: int) -> bool:
        # Keep standalone/legacy starts working; a member of an active pool may
        # only be started if it is this user's deterministic/persisted variant.
        member = select(OlympiadPoolItem.id).join(OlympiadPool).where(
            OlympiadPoolItem.olympiad_id == olympiad_id,
            OlympiadPool.is_active.is_(True),
        ).exists()
        assigned = self._assigned_variants(user_id).where(Olympiad.id == olympiad_id).exists()
        res = await self.db.execute(select(or_(~member, assigned)))
        return bool(res.scalar_one())

    async def remember_assignment_for_start(self, user_id: int, olympiad_id: int) -> None:
        chosen = self._assigned_variants(user_id).where(Olympiad.id == olympiad_id).with_only_columns(
            literal(user_id), OlympiadPool.id, Olympiad.id,
        )
        await self.db.execute(insert(OlympiadAssignment).from_select(
            ["user_id", "pool_id", "olympiad_id"], chosen,
        ).on_conflict_do_nothing(index_elements=["user_id", "pool_id"]))
        # No commit here: preserve the user lock until the attempt is created.

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
