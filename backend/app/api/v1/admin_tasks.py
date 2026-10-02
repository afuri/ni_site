from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_admin_or_moderator
from app.core.errors import http_error
from app.models.user import User
from app.models.task import Subject, TaskType
from app.repos.tasks import TasksRepo
from app.services.tasks import TasksService
from app.schemas.tasks import TaskCreate, TaskUpdate, TaskRead, TaskPage
from app.api.v1.openapi_errors import response_example
from app.api.v1.openapi_examples import EXAMPLE_TASK_READ, response_model_example
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
    response_model=TaskPage,
    tags=["admin"],
    description="Список заданий банка",
    responses={
        200: {"description": "TaskPage: items, optional total"},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_tasks(
    include_total: bool = Query(default=False),
    subject: Subject | None = Query(default=None),
    task_type: TaskType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    archived: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = TasksRepo(db)
    items = await repo.list(subject=subject, task_type=task_type, limit=limit, offset=offset, archived=archived)
    total = await repo.count(subject=subject, task_type=task_type, archived=archived) if include_total else None
    return {"items": items, "total": total}


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
    description="Редактирование запрещено: создайте копию задания",
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
        raise http_error(409, str(e), message="Задание неизменяемо. Создайте копию.")


@router.delete(
    "/{task_id}",
    status_code=204,
    tags=["admin"],
    description="Физическое удаление запрещено: используйте архивирование",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.TASK_NOT_FOUND),
        410: {"description": "physical_delete_disabled"},
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
    raise http_error(410, "physical_delete_disabled", message="Используйте архивирование задания.")


@router.post("/{task_id}/archive", response_model=TaskRead, tags=["admin"])
async def archive_task(task_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin_or_moderator())):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise http_error(404, codes.TASK_NOT_FOUND)
    return await TasksService(repo).archive(task=task)


@router.post("/{task_id}/copy", response_model=TaskRead, status_code=201, tags=["admin"])
async def copy_task(task_id: int, payload: TaskCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin_or_moderator())):
    repo = TasksRepo(db)
    task = await repo.get(task_id)
    if not task:
        raise http_error(404, codes.TASK_NOT_FOUND)
    return await TasksService(repo).copy(task=task, payload=payload, created_by_user_id=user.id)
