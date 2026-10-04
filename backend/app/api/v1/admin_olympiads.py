from io import BytesIO

from fastapi import APIRouter, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole, User
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_tasks import OlympiadTasksRepo
from app.repos.tasks import TasksRepo
from app.schemas.olympiads_admin import (
    OlympiadCreate, OlympiadUpdate, OlympiadRead, OlympiadListRead,
    OlympiadTaskAdd, OlympiadTaskRead,
)
from app.services.olympiads_admin import AdminOlympiadsService
from app.schemas.olympiads_admin import OlympiadTaskFullRead
from app.schemas.tasks import TaskRead
from app.services.olympiad_pdf import build_olympiad_pdf_bytes
from app.services.participant_pdf import ParticipantPdfService
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import (
    EXAMPLE_OLYMPIAD_READ,
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
    response_model=list[OlympiadListRead],
    tags=["admin"],
    description="Список олимпиад админа",
    responses={
        200: response_model_list_example([{**item, "can_return_to_draft": False} for item in EXAMPLE_LISTS["olympiads"]]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_olympiads(
    archived: bool = Query(default=False),
    mine: bool = Query(default=True, description="If true, only olympiads created by current admin"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    created_by = admin.id if mine else None
    items = await repo.list(created_by_user_id=created_by, limit=limit, offset=offset, archived=archived)
    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    returnable = await service.returnable_ids([item.id for item in items])
    return [OlympiadListRead(**OlympiadRead.model_validate(item).model_dump(),
                            can_return_to_draft=item.id in returnable) for item in items]


@router.post(
    "/{olympiad_id}/return-to-draft",
    response_model=OlympiadRead,
    tags=["admin"],
    description="Вернуть в черновик неархивированную олимпиаду вне пула, без любых попыток и назначений. ID и задания сохраняются.",
    responses={
        200: response_model_example(OlympiadRead, EXAMPLE_OLYMPIAD_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_example(codes.CANNOT_RETURN_OLYMPIAD_TO_DRAFT),
    },
)
async def return_olympiad_to_draft(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
    service = AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db))
    try:
        return await service.return_to_draft(olympiad=obj, admin_id=admin.id)
    except ValueError as exc:
        if str(exc) == codes.CANNOT_RETURN_OLYMPIAD_TO_DRAFT:
            raise http_error(409, codes.CANNOT_RETURN_OLYMPIAD_TO_DRAFT,
                             message="Возврат в черновик запрещён: олимпиада архивирована, входит в пул или имеет попытки/назначения.")
        raise


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
        409: response_examples(codes.CANNOT_CHANGE_PUBLISHED_RULES, codes.STANDALONE_OLYMPIAD_IN_POOL),
        422: response_examples(codes.INVALID_AVAILABILITY, codes.INVALID_STANDALONE_MODE),
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
        if code == codes.STANDALONE_OLYMPIAD_IN_POOL:
            raise http_error(409, code, message="Общая олимпиада не может входить в пул. Сначала удалите её пул.")
        if code == codes.INVALID_STANDALONE_MODE:
            raise http_error(422, code)
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
    raise http_error(410, "physical_delete_disabled", message="Используйте архивирование олимпиады.")


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
    response_model=list[OlympiadTaskFullRead] | list[OlympiadTaskRead],
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
    with_details: bool = Query(False),
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    repo = OlympiadTasksRepo(db)
    if with_details:
        return await list_olympiad_tasks_full(olympiad_id, db, admin)
    return await repo.list_by_olympiad(olympiad_id)


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
        raise http_error(409, str(e))


@router.put("/{olympiad_id}/participant-pdf", response_model=OlympiadRead, tags=["admin"],
    description="Загрузить проверенный PDF до 20 МБ для общей олимпиады. Только редактируемый черновик, приватное хранилище.",
    responses={401: response_example(codes.MISSING_TOKEN), 403: response_example(codes.FORBIDDEN),
               404: response_example(codes.OLYMPIAD_NOT_FOUND),
               409: response_examples(codes.CANNOT_CHANGE_PUBLISHED_RULES, codes.PARTICIPANT_PDF_NOT_ALLOWED),
               413: response_example(codes.PARTICIPANT_PDF_TOO_LARGE), 422: response_example(codes.PARTICIPANT_PDF_INVALID),
               503: response_example(codes.STORAGE_UNAVAILABLE)})
async def upload_participant_pdf(olympiad_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                                 admin: User = Depends(require_role(UserRole.admin))):
    try:
        return await ParticipantPdfService(db).upload(olympiad_id, file, admin.id)
    finally:
        await file.close()


@router.delete("/{olympiad_id}/participant-pdf", response_model=OlympiadRead, tags=["admin"],
    description="Отключить PDF участника в редактируемом черновике.",
    responses={401: response_example(codes.MISSING_TOKEN), 403: response_example(codes.FORBIDDEN),
               404: response_example(codes.OLYMPIAD_NOT_FOUND),
               409: response_examples(codes.CANNOT_CHANGE_PUBLISHED_RULES, codes.PARTICIPANT_PDF_NOT_ALLOWED)})
async def remove_participant_pdf(olympiad_id: int, db: AsyncSession = Depends(get_db),
                                 admin: User = Depends(require_role(UserRole.admin))):
    return await ParticipantPdfService(db).remove(olympiad_id, admin.id)


@router.get("/{olympiad_id}/participant-pdf", tags=["admin"], response_class=StreamingResponse, description="Скачать загруженный PDF для проверки администратором.",
    responses={200: {"content": {"application/pdf": {}}}, 401: response_example(codes.MISSING_TOKEN), 403: response_example(codes.FORBIDDEN),
               404: response_examples(codes.OLYMPIAD_NOT_FOUND, codes.PARTICIPANT_PDF_NOT_FOUND),
               409: response_example(codes.PARTICIPANT_PDF_NOT_ALLOWED), 503: response_example(codes.STORAGE_UNAVAILABLE)})
async def preview_participant_pdf(olympiad_id: int, db: AsyncSession = Depends(get_db),
                                 admin: User = Depends(require_role(UserRole.admin))):
    return await ParticipantPdfService(db).download(olympiad_id, admin)


@router.get(
    "/{olympiad_id}/pdf",
    tags=["admin"],
    description="Скачать PDF-версию олимпиады",
    responses={
        200: {"description": "PDF-файл"},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
    },
)
async def export_olympiad_pdf(
    olympiad_id: int,
    include_description: bool = Query(default=False),
    include_task_title: bool = Query(default=False),
    include_task_and_answer_type: bool = Query(default=False),
    include_correct_answer: bool = Query(default=False),
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    o_repo = OlympiadsRepo(db)
    obj = await o_repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)

    repo = OlympiadTasksRepo(db)
    rows = await repo.list_full_by_olympiad(olympiad_id)
    pdf_bytes = build_olympiad_pdf_bytes(
        olympiad=obj,
        task_rows=rows,
        include_description=include_description,
        include_task_title=include_task_title,
        include_task_and_answer_type=include_task_and_answer_type,
        include_correct_answer=include_correct_answer,
    )
    file_name = f"olympiad_{olympiad_id}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.post("/{olympiad_id}/archive", response_model=OlympiadRead, tags=["admin"])
async def archive_olympiad(olympiad_id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role(UserRole.admin))):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
    return await AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db)).archive(olympiad=obj)


@router.post("/{olympiad_id}/copy", response_model=OlympiadRead, status_code=201, tags=["admin"])
async def copy_olympiad(olympiad_id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role(UserRole.admin))):
    repo = OlympiadsRepo(db)
    obj = await repo.get(olympiad_id)
    if not obj:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
    try:
        return await AdminOlympiadsService(repo, OlympiadTasksRepo(db), TasksRepo(db)).copy(olympiad=obj, admin_id=admin.id)
    except ValueError as exc:
        raise http_error(409, str(exc))
