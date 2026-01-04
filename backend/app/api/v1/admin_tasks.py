from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_admin_or_moderator
from app.core.errors import http_error
from app.models.user import User
from app.models.task import Subject, TaskType
from app.repos.tasks import TasksRepo
from app.services.tasks import TasksService
from app.schemas.tasks import TaskCreate, TaskUpdate, TaskRead
from app.api.v1.openapi_errors import response_example

router = APIRouter(prefix="/admin/tasks")


@router.post(
    "",
    response_model=TaskRead,
    status_code=201,
    tags=["admin"],
    description="Создать задание в банке",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        422: response_example("validation_error"),
    },
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
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
    },
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
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("task_not_found"),
    },
)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise http_error(404, "task_not_found")
    return task


@router.put(
    "/{task_id}",
    response_model=TaskRead,
    tags=["admin"],
    description="Обновить задание банка",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("task_not_found"),
        422: response_example("validation_error"),
    },
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
        raise http_error(404, "task_not_found")

    patch = payload.model_dump(exclude_unset=True)
    service = TasksService(repo)
    try:
        return await service.update(task=task, patch=patch)
    except ValueError as e:
        raise http_error(422, str(e))


@router.delete(
    "/{task_id}",
    status_code=204,
    tags=["admin"],
    description="Удалить задание банка",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("task_not_found"),
    },
)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise http_error(404, "task_not_found")
    service = TasksService(repo)
    await service.delete(task=task)
    return None
