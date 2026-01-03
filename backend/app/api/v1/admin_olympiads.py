from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole, User
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_tasks import OlympiadTasksRepo
from app.repos.tasks import TasksRepo
from app.schemas.olympiads_admin import (
    OlympiadCreate, OlympiadUpdate, OlympiadRead,
    OlympiadTaskAdd, OlympiadTaskRead,
)
from app.services.olympiads_admin import AdminOlympiadsService
from app.schemas.olympiads_admin import OlympiadTaskFullRead
from app.schemas.tasks import TaskRead



router = APIRouter(prefix="/admin/olympiads")


@router.post(
    "",
    response_model=OlympiadRead,
    status_code=201,
    tags=["admin"],
    description="Создать олимпиаду (админ)",
)
async def create_olympiad(
    payload: OlympiadCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    service = AdminOlympiadsService(OlympiadsRepo(db), OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.create(data=payload.model_dump(), admin_id=admin.id)
    except ValueError as e:
        if str(e) == "invalid_availability":
            raise http_error(422, "invalid_availability")
        raise


@router.get(
    "",
    response_model=list[OlympiadRead],
    tags=["admin"],
    description="Список олимпиад админа",
)
async def list_olympiads(
    mine: bool = Query(default=True, description="If true, only olympiads created by current admin"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    created_by = admin.id if mine else None
    return await repo.list(created_by_user_id=created_by, limit=limit, offset=offset)


@router.get(
    "/{olympiad_id}",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Получить олимпиаду (админ)",
)
async def get_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")
    return obj


@router.put(
    "/{olympiad_id}",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Обновить олимпиаду (админ)",
)
async def update_olympiad(
    olympiad_id: int,
    payload: OlympiadUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.update(olympiad=obj, patch=payload.model_dump(exclude_unset=True))
    except ValueError as e:
        code = str(e)
        if code == "invalid_availability":
            raise http_error(422, "invalid_availability")
        if code == "cannot_change_published_rules":
            raise http_error(409, "cannot_change_published_rules")
        raise


@router.post(
    "/{olympiad_id}/tasks",
    response_model=OlympiadTaskRead,
    status_code=201,
    tags=["admin"],
    description="Добавить задание в олимпиаду",
)
async def add_task_to_olympiad(
    olympiad_id: int,
    payload: OlympiadTaskAdd,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    service = AdminOlympiadsService(o_repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.add_task(
            olympiad=obj,
            task_id=payload.task_id,
            sort_order=payload.sort_order,
            max_score=payload.max_score,
        )
    except ValueError as e:
        code = str(e)
        if code == "cannot_modify_published":
            raise http_error(409, "cannot_modify_published")
        if code == "task_not_found":
            raise http_error(404, "task_not_found")
        raise


@router.get(
    "/{olympiad_id}/tasks",
    response_model=list[OlympiadTaskRead],
    tags=["admin"],
    description="Список заданий олимпиады",
)
async def list_olympiad_tasks(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    repo = OlympiadTasksRepo(db)
    return await repo.list_by_olympiad(olympiad_id)


@router.get(
    "/{olympiad_id}/tasks/full",
    response_model=list[OlympiadTaskFullRead],
    tags=["admin"],
    description="Список заданий олимпиады с деталями",
)
async def list_olympiad_tasks_full(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    repo = OlympiadTasksRepo(db)
    rows = await repo.list_full_by_olympiad(olympiad_id)

    # rows: [(OlympiadTask, Task), ...]
    out = []
    for ot, task in rows:
        out.append(
            OlympiadTaskFullRead(
                task_id=ot.task_id,
                sort_order=ot.sort_order,
                max_score=ot.max_score,
                task=TaskRead.model_validate(task),
            )
        )
    return out


@router.delete(
    "/{olympiad_id}/tasks/{task_id}",
    status_code=204,
    tags=["admin"],
    description="Удалить задание из олимпиады",
)
async def remove_task_from_olympiad(
    olympiad_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    service = AdminOlympiadsService(o_repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        await service.remove_task(olympiad=obj, task_id=task_id)
        return None
    except ValueError as e:
        code = str(e)
        if code == "cannot_modify_published":
            raise http_error(409, "cannot_modify_published")
        raise


@router.post(
    "/{olympiad_id}/publish",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Опубликовать или снять с публикации",
)
async def set_publish(
    olympiad_id: int,
    publish: bool = Query(..., description="true to publish, false to unpublish"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, "olympiad_not_found")

    service = AdminOlympiadsService(o_repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.publish(olympiad=obj, publish=publish)
    except ValueError as e:
        if str(e) == "cannot_publish_empty":
            raise http_error(409, "cannot_publish_empty")
        raise
