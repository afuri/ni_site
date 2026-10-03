from __future__ import annotations

from sqlalchemy import select, func, exists, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core import error_codes as codes
from app.models.attempt import AttemptAnswer, AttemptTaskGrade
from app.models.olympiad_task import OlympiadTask
from app.models.task import Task, Subject, TaskType


class TasksRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, task: Task) -> Task:
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        setattr(task, "can_delete", True)
        return task

    @staticmethod
    def _can_delete_expression() -> ColumnElement[bool]:
        return and_(
            ~exists(select(OlympiadTask.id).where(OlympiadTask.task_id == Task.id)),
            ~exists(select(AttemptAnswer.id).where(AttemptAnswer.task_id == Task.id)),
            ~exists(select(AttemptTaskGrade.id).where(AttemptTaskGrade.task_id == Task.id)),
        )

    async def get(self, task_id: int, *, for_update: bool = False) -> Task | None:
        stmt = select(Task, self._can_delete_expression()).where(Task.id == task_id)
        if for_update:
            stmt = stmt.with_for_update(of=Task)
        row = (await self.db.execute(stmt)).one_or_none()
        if row is None:
            return None
        task, can_delete = row
        # Response metadata only; no database column or extra per-task query.
        setattr(task, "can_delete", bool(can_delete))
        return task

    async def list(self, subject: Subject | None, task_type: TaskType | None, limit: int, offset: int, archived: bool = False) -> list[Task]:
        stmt = select(Task, self._can_delete_expression()).where(Task.archived_at.is_not(None) if archived else Task.archived_at.is_(None))
        if subject:
            stmt = stmt.where(Task.subject == subject)
        if task_type:
            stmt = stmt.where(Task.task_type == task_type)
        stmt = stmt.order_by(Task.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        items = []
        for task, can_delete in res.all():
            setattr(task, "can_delete", bool(can_delete))
            items.append(task)
        return items

    async def count(self, subject: Subject | None, task_type: TaskType | None, archived: bool = False) -> int:
        stmt = select(func.count()).select_from(Task).where(Task.archived_at.is_not(None) if archived else Task.archived_at.is_(None))
        if subject:
            stmt = stmt.where(Task.subject == subject)
        if task_type:
            stmt = stmt.where(Task.task_type == task_type)
        res = await self.db.execute(stmt)
        return int(res.scalar_one())

    async def update(self, task: Task) -> Task:
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete(self, task: Task) -> None:
        can_delete = await self.db.scalar(select(self._can_delete_expression()).where(Task.id == task.id))
        if not can_delete:
            raise ValueError(codes.TASK_IN_OLYMPIAD)
        await self.db.delete(task)
        try:
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            # Foreign keys also protect against a concurrent new attachment.
            if getattr(error.orig, "sqlstate", None) == "23503":
                raise ValueError(codes.TASK_IN_OLYMPIAD) from error
            raise

    async def list_olympiad_ids_for_task(self, task_id: int) -> list[int]:
        res = await self.db.execute(
            select(OlympiadTask.olympiad_id).where(OlympiadTask.task_id == task_id)
        )
        return list(res.scalars().all())
