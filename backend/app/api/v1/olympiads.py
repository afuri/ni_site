from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.core import error_codes as codes
from app.core.olympiad_codes import olympiad_id_from_code
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_pools import OlympiadPoolsRepo
from app.repos.olympiad_assignments import OlympiadAssignmentsRepo
from app.services.olympiad_pools import OlympiadPoolsService
from app.services.participant_pdf import ParticipantPdfService
from app.schemas.olympiads import OlympiadPublicRead
from app.schemas.olympiad_pools import OlympiadAssignRequest
from app.models.user import User, UserRole
from app.api.v1.openapi_examples import EXAMPLE_LISTS, EXAMPLE_OLYMPIAD_READ, response_model_list_example, response_model_example
from app.api.v1.openapi_errors import response_example, response_examples

router = APIRouter(prefix="/olympiads")


@router.get(
    "/by-code/{code}", response_model=OlympiadPublicRead, tags=["olympiads"],
    description="Найти опубликованную неархивированную олимпиаду по коду, доступную по серверному времени. Пул не проверяется; класс и аккаунт проверяются при старте.",
    responses={
        200: response_model_example(OlympiadPublicRead, EXAMPLE_OLYMPIAD_READ),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_example(codes.OLYMPIAD_NOT_AVAILABLE),
        422: response_example(codes.INVALID_OLYMPIAD_CODE),
    },
)
async def get_olympiad_by_code(code: str, db: AsyncSession = Depends(get_read_db)):
    try:
        olympiad_id = olympiad_id_from_code(code)
    except ValueError:
        raise http_error(422, codes.INVALID_OLYMPIAD_CODE)
    olympiad = await OlympiadsRepo(db).get(olympiad_id)
    if not olympiad or olympiad.archived_at or not olympiad.is_published:
        raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
    if not olympiad.available_from <= datetime.now(timezone.utc) <= olympiad.available_to:
        raise http_error(409, codes.OLYMPIAD_NOT_AVAILABLE)
    return olympiad


@router.get(
    "",
    response_model=list[OlympiadPublicRead],
    tags=["olympiads"],
    description="Список опубликованных олимпиад",
    responses={200: response_model_list_example(EXAMPLE_LISTS["olympiads"])},
)
async def list_published_olympiads(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
):
    repo = OlympiadsRepo(db)
    return await repo.list_published(limit=limit, offset=offset)


@router.get(
    "/my",
    response_model=list[OlympiadPublicRead],
    tags=["olympiads"],
    description=("Опубликованные варианты текущего ученика из активных пулов: "
                 "распределение ((user_id - 1) % 4) + 1, с приоритетом сохранённого назначения. "
                 "Будущие олимпиады включены; завершённые работы, истёкшие попытки и окна исключены. "
                 "Общие олимпиады без пула также включены; активная попытка общей работы сохраняется после закрытия окна. "
                 "Сортировка по началу, затем ID. Просмотр не создаёт назначений или попыток."),
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["olympiads"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_my_olympiads(
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = OlympiadPoolsService(
        OlympiadPoolsRepo(db), OlympiadAssignmentsRepo(db), OlympiadsRepo(db)
    )
    return await service.list_for_user(student)


@router.get("/{olympiad_id}/participant-pdf", tags=["olympiads"], response_class=StreamingResponse,
    description="Скачать PDF общей олимпиады для своего класса до старта в период проведения или во время своей активной попытки. После завершения/истечения попытки недоступен. Скачивание не создаёт попытку.",
    responses={200: {"content": {"application/pdf": {}}}, 401: response_example(codes.MISSING_TOKEN),
               403: response_examples(codes.FORBIDDEN, codes.EMAIL_NOT_VERIFIED),
               404: response_examples(codes.OLYMPIAD_NOT_FOUND, codes.PARTICIPANT_PDF_NOT_FOUND),
               409: response_examples(codes.PARTICIPANT_PDF_NOT_ALLOWED, codes.OLYMPIAD_NOT_AVAILABLE, codes.OLYMPIAD_AGE_GROUP_MISMATCH),
               503: response_example(codes.STORAGE_UNAVAILABLE)})
async def download_participant_pdf(olympiad_id: int, db: AsyncSession = Depends(get_db),
                                   student: User = Depends(require_role(UserRole.student))):
    return await ParticipantPdfService(db).download(olympiad_id, student)


@router.post(
    "/assign",
    response_model=OlympiadPublicRead,
    tags=["olympiads"],
    description="Назначить вариант выбранной работы по pool_id",
    responses={
        200: {},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        409: response_examples(
            codes.OLYMPIAD_AGE_GROUP_MISMATCH,
            codes.OLYMPIAD_POOL_NOT_ACTIVE,
            codes.OLYMPIAD_POOL_EMPTY,
            codes.OLYMPIAD_NOT_AVAILABLE,
            codes.OLYMPIAD_NOT_PUBLISHED,
        ),
        422: response_example(codes.INVALID_SUBJECT),
    },
)
async def assign_olympiad(
    payload: OlympiadAssignRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = OlympiadPoolsService(
        OlympiadPoolsRepo(db), OlympiadAssignmentsRepo(db), OlympiadsRepo(db)
    )
    try:
        return await service.assign_for_user(user=student, pool_id=payload.pool_id)
    except ValueError as e:
        code = str(e)
        if code == codes.INVALID_SUBJECT:
            raise http_error(422, codes.INVALID_SUBJECT)
        if code == codes.OLYMPIAD_POOL_NOT_ACTIVE:
            raise http_error(409, codes.OLYMPIAD_POOL_NOT_ACTIVE)
        if code == codes.OLYMPIAD_POOL_EMPTY:
            raise http_error(409, codes.OLYMPIAD_POOL_EMPTY)
        if code == codes.OLYMPIAD_AGE_GROUP_MISMATCH:
            raise http_error(409, codes.OLYMPIAD_AGE_GROUP_MISMATCH)
        if code == codes.OLYMPIAD_NOT_PUBLISHED:
            raise http_error(409, codes.OLYMPIAD_NOT_PUBLISHED)
        if code == codes.OLYMPIAD_NOT_AVAILABLE:
            raise http_error(409, codes.OLYMPIAD_NOT_AVAILABLE)
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        raise http_error(409, code)
