from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError
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
from app.api.v1.openapi_examples import EXAMPLE_LISTS, EXAMPLE_TASK_READ, response_model_example, response_model_list_example
from app.core import error_codes as codes

router = APIRouter(prefix="/admin/tasks")


@router.post(
    "",
    response_model=TaskRead,
    status_code=201,
    tags=["admin"],
    description="Создать задание в банке",
    responses={
        201: response_model_example(TaskRead, EXAMPLE_TASK_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        422: response_example(codes.VALIDATION_ERROR),
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
        200: response_model_list_example(EXAMPLE_LISTS["tasks"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
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
    "/count",
    response_model=int,
    tags=["admin"],
    description="Количество заданий банка",
    responses={
        200: {"content": {"application/json": {"example": 0}}},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def count_tasks(
    subject: Subject | None = Query(default=None),
    task_type: TaskType | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    return await repo.count(subject=subject, task_type=task_type)


@router.get(
    "/{task_id}",
    response_model=TaskRead,
    tags=["admin"],
    description="Получить задание банка",
    responses={
        200: response_model_example(TaskRead, EXAMPLE_TASK_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.TASK_NOT_FOUND),
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
        raise http_error(404, codes.TASK_NOT_FOUND)
    return task


@router.put(
    "/{task_id}",
    response_model=TaskRead,
    tags=["admin"],
    description="Обновить задание банка",
    responses={
        200: response_model_example(TaskRead, EXAMPLE_TASK_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.TASK_NOT_FOUND),
        422: response_example(codes.VALIDATION_ERROR),
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
        raise http_error(404, codes.TASK_NOT_FOUND)

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
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.TASK_NOT_FOUND),
        409: response_example(codes.TASK_IN_OLYMPIAD),
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
        raise http_error(404, codes.TASK_NOT_FOUND)
    service = TasksService(repo)
    try:
        await service.delete(task=task)
    except IntegrityError:
        await db.rollback()
        raise http_error(409, codes.TASK_IN_OLYMPIAD)
    return None
