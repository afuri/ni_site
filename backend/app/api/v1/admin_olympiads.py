from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
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
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import (
    EXAMPLE_OLYMPIAD_READ,
    EXAMPLE_OLYMPIAD_TASK_FULL_READ_LIST,
    EXAMPLE_OLYMPIAD_TASK_READ,
    EXAMPLE_LISTS,
    response_model_example,
    response_model_list_example,
)
from app.core import error_codes as codes



router = APIRouter(prefix="/admin/olympiads")


@router.post(
    "",
    response_model=OlympiadRead,
    status_code=201,
    tags=["admin"],
    description="Создать олимпиаду (админ)",
    responses={
        201: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        422: response_example(codes.INVALID_AVAILABILITY),
    },
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
        if str(e) == codes.INVALID_AVAILABILITY:
            raise http_error(422, codes.INVALID_AVAILABILITY)
        raise


@router.get(
    "",
    response_model=list[OlympiadRead],
    tags=["admin"],
    description="Список олимпиад админа",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["olympiads"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_olympiads(
    mine: bool = Query(default=True, description="If true, only olympiads created by current admin"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
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
    responses={
        200: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def get_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
    return obj


@router.put(
    "/{olympiad_id}",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Обновить олимпиаду (админ)",
    responses={
        200: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_examples(codes.CANNOT_CHANGE_PUBLISHED_RULES),
        422: response_example(codes.INVALID_AVAILABILITY),
    },
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
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.update(olympiad=obj, patch=payload.model_dump(exclude_unset=True))
    except ValueError as e:
        code = str(e)
        if code == codes.INVALID_AVAILABILITY:
            raise http_error(422, codes.INVALID_AVAILABILITY)
        if code == codes.CANNOT_CHANGE_PUBLISHED_RULES:
            raise http_error(409, codes.CANNOT_CHANGE_PUBLISHED_RULES)
        raise


@router.post(
    "/{olympiad_id}/results",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Отметить готовность результатов (админ)",
    responses={
        200: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def release_results(
    olympiad_id: int,
    released: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    return await service.release_results(olympiad=obj, released=released)


@router.delete(
    "/{olympiad_id}",
    status_code=204,
    tags=["admin"],
    description="Удалить олимпиаду",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def delete_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    await service.delete(olympiad=obj)
    return None


@router.post(
    "/{olympiad_id}/tasks",
    response_model=OlympiadTaskRead,
    status_code=201,
    tags=["admin"],
    description="Добавить задание в олимпиаду",
    responses={
        201: response_model_example(OlympiadTaskRead, EXAMPLE_OLYMPIAD_TASK_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_examples(codes.OLYMPIAD_NOT_FOUND, codes.TASK_NOT_FOUND),
        409: response_examples(codes.CANNOT_MODIFY_PUBLISHED),
    },
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
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

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
        if code == codes.CANNOT_MODIFY_PUBLISHED:
            raise http_error(409, codes.CANNOT_MODIFY_PUBLISHED)
        if code == codes.TASK_NOT_FOUND:
            raise http_error(404, codes.TASK_NOT_FOUND)
        raise


@router.get(
    "/{olympiad_id}/tasks",
    response_model=list[OlympiadTaskRead],
    tags=["admin"],
    description="Список заданий олимпиады",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["olympiad_tasks"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def list_olympiad_tasks(
    olympiad_id: int,
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    repo = OlympiadTasksRepo(db)
    return await repo.list_by_olympiad(olympiad_id)


@router.get(
    "/{olympiad_id}/tasks/full",
    response_model=list[OlympiadTaskFullRead],
    tags=["admin"],
    description="Список заданий олимпиады с деталями",
    responses={
        200: response_model_list_example(EXAMPLE_OLYMPIAD_TASK_FULL_READ_LIST),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def list_olympiad_tasks_full(
    olympiad_id: int,
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

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
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_examples(codes.CANNOT_MODIFY_PUBLISHED),
    },
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
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    service = AdminOlympiadsService(o_repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        await service.remove_task(olympiad=obj, task_id=task_id)
        return None
    except ValueError as e:
        code = str(e)
        if code == codes.CANNOT_MODIFY_PUBLISHED:
            raise http_error(409, codes.CANNOT_MODIFY_PUBLISHED)
        raise


@router.post(
    "/{olympiad_id}/publish",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Опубликовать или снять с публикации",
    responses={
        200: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_examples(codes.CANNOT_PUBLISH_EMPTY),
    },
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
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    service = AdminOlympiadsService(o_repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.publish(olympiad=obj, publish=publish)
    except ValueError as e:
        if str(e) == codes.CANNOT_PUBLISH_EMPTY:
            raise http_error(409, codes.CANNOT_PUBLISH_EMPTY)
        raise
