from datetime import datetime, timezone

from app.models.task import Task, TaskType
from app.repos.tasks import TasksRepo
from app.schemas.tasks import TaskCreate


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
        # Если обновляют payload — валидируем через TaskCreate-валидатор, используя текущий/новый task_type
        new_task_type = patch.get("task_type", task.task_type)

        if "payload" in patch and patch["payload"] is not None:
            # Используем TaskCreate как валидатор контракта
            tmp = TaskCreate(
                subject=patch.get("subject", task.subject),
                title=patch.get("title", task.title),
                content=patch.get("content", task.content),
                task_type=new_task_type,
                image_key=patch.get("image_key", task.image_key),
                payload=patch["payload"],
            )
            patch["payload"] = tmp.payload

        for k, v in patch.items():
            setattr(task, k, v)

        task.updated_at = datetime.now(timezone.utc)
        return await self.repo.update(task)
