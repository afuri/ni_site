from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad_pool import OlympiadAssignment


class OlympiadAssignmentsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_user_pool(self, user_id: int, pool_id: int) -> OlympiadAssignment | None:
        res = await self.db.execute(
            select(OlympiadAssignment)
            .where(OlympiadAssignment.user_id == user_id, OlympiadAssignment.pool_id == pool_id)
        )
        return res.scalar_one_or_none()

    async def create_assignment(self, assignment: OlympiadAssignment) -> OlympiadAssignment:
        self.db.add(assignment)
        await self.db.commit()
        await self.db.refresh(assignment)
        return assignment
