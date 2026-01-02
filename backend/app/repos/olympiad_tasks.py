from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad_task import OlympiadTask
from app.models.task import Task


class OlympiadTasksRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def add(self, obj: OlympiadTask) -> OlympiadTask:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def list_by_olympiad(self, olympiad_id: int) -> list[OlympiadTask]:
        res = await self.db.execute(
            select(OlympiadTask)
            .where(OlympiadTask.olympiad_id == olympiad_id)
            .order_by(OlympiadTask.sort_order.asc(), OlympiadTask.id.asc())
        )
        return list(res.scalars().all())

    async def get_by_olympiad_task(self, olympiad_id: int, task_id: int) -> OlympiadTask | None:
        res = await self.db.execute(
            select(OlympiadTask).where(
                OlympiadTask.olympiad_id == olympiad_id,
                OlympiadTask.task_id == task_id,
            )
        )
        return res.scalar_one_or_none()

    async def delete(self, obj: OlympiadTask) -> None:
        await self.db.delete(obj)
        await self.db.commit()
    
    async def list_full_by_olympiad(self, olympiad_id: int) -> list[tuple[OlympiadTask, Task]]:
        res = await self.db.execute(
            select(OlympiadTask, Task)
            .join(Task, Task.id == OlympiadTask.task_id)
            .where(OlympiadTask.olympiad_id == olympiad_id)
            .order_by(OlympiadTask.sort_order.asc(), OlympiadTask.id.asc())
        )
        return list(res.all())
