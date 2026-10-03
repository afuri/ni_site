from datetime import datetime, timezone

from app.models.task import Task
from app.repos.tasks import TasksRepo
from app.schemas.tasks import TaskCreate
from app.core.redis import safe_redis
from app.core.cache import olympiad_tasks_key


class TasksService:
    def __init__(self, repo: TasksRepo):
        self.repo = repo

    async def create(self, *, payload: TaskCreate, created_by_user_id: int) -> Task:
        # TaskCreate уже валидирует payload по task_type
        now = datetime.now(timezone.utc)
        task = Task(
            subject=payload.subject,
            title=payload.title,
            content=payload.content,
            task_type=payload.task_type,
            image_key=payload.image_key,
            payload=payload.payload,
            created_by_user_id=created_by_user_id,
            created_at=now,
            updated_at=now,
        )
        return await self.repo.create(task)

    async def update(self, *, task: Task, patch: dict) -> Task:
        raise ValueError("task_immutable")

    async def copy(self, *, task: Task, payload: TaskCreate, created_by_user_id: int) -> Task:
        return await self.create(payload=payload, created_by_user_id=created_by_user_id)

    async def archive(self, *, task: Task) -> Task:
        if task.archived_at is None:
            task.archived_at = datetime.now(timezone.utc)
        saved = await self.repo.update(task)
        await self._invalidate_task_cache(task.id)
        return saved

    async def _invalidate_task_cache(self, task_id: int) -> None:
        redis = await safe_redis()
        if redis is None:
            return
        try:
            olympiad_ids = await self.repo.list_olympiad_ids_for_task(task_id)
            if not olympiad_ids:
                return
            keys = [olympiad_tasks_key(oid) for oid in olympiad_ids]
            await redis.delete(*keys)
        except Exception:
            pass

    async def delete(self, *, task: Task) -> None:
        await self.repo.delete(task)
