from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_admin_or_moderator
from app.models.user import User
from app.models.task import Subject, TaskType
from app.repos.tasks import TasksRepo
from app.services.tasks import TasksService
from app.schemas.tasks import TaskCreate, TaskUpdate, TaskRead

router = APIRouter(prefix="/admin/tasks")


@router.post(
    "",
    response_model=TaskRead,
    status_code=201,
    tags=["admin"],
    description="Создать задание в банке",
)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    service = TasksService(TasksRepo(db))
    return await service.create(payload=payload, created_by_user_id=user.id)


@router.get(
    "",
    response_model=list[TaskRead],
    tags=["admin"],
    description="Список заданий банка",
)
async def list_tasks(
    subject: Subject | None = Query(default=None),
    task_type: TaskType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    return await repo.list(subject=subject, task_type=task_type, limit=limit, offset=offset)


@router.get(
    "/{task_id}",
    response_model=TaskRead,
    tags=["admin"],
    description="Получить задание банка",
)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    return task


@router.put(
    "/{task_id}",
    response_model=TaskRead,
    tags=["admin"],
    description="Обновить задание банка",
)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")

    patch = payload.model_dump(exclude_unset=True)
    service = TasksService(repo)
    try:
        return await service.update(task=task, patch=patch)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete(
    "/{task_id}",
    status_code=204,
    tags=["admin"],
    description="Удалить задание банка",
)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    await repo.delete(task)
    return None
