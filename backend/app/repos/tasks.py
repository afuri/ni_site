from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.olympiad_task import OlympiadTask
from app.models.task import Task, Subject, TaskType


class TasksRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, task: Task) -> Task:
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def get(self, task_id: int) -> Task | None:
        res = await self.db.execute(select(Task).where(Task.id == task_id))
        return res.scalar_one_or_none()

    async def list(self, subject: Subject | None, task_type: TaskType | None, limit: int, offset: int) -> list[Task]:
        stmt = select(Task)
        if subject:
            stmt = stmt.where(Task.subject == subject)
        if task_type:
            stmt = stmt.where(Task.task_type == task_type)
        stmt = stmt.order_by(Task.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def update(self, task: Task) -> Task:
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete(self, task: Task) -> None:
        await self.db.delete(task)
        await self.db.commit()

    async def list_olympiad_ids_for_task(self, task_id: int) -> list[int]:
        res = await self.db.execute(
            select(OlympiadTask.olympiad_id).where(OlympiadTask.task_id == task_id)
        )
        return list(res.scalars().all())
