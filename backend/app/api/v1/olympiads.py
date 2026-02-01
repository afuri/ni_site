from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.core import error_codes as codes
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_pools import OlympiadPoolsRepo
from app.repos.olympiad_assignments import OlympiadAssignmentsRepo
from app.services.olympiad_pools import OlympiadPoolsService
from app.schemas.olympiads import OlympiadPublicRead
from app.schemas.olympiad_pools import OlympiadAssignRequest
from app.models.user import User, UserRole
from app.api.v1.openapi_examples import EXAMPLE_LISTS, response_model_list_example
from app.api.v1.openapi_errors import response_example, response_examples

router = APIRouter(prefix="/olympiads")


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


@router.post(
    "/assign",
    response_model=OlympiadPublicRead,
    tags=["olympiads"],
    description="Назначить олимпиаду из активного пула по предмету",
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
        return await service.assign_for_user(user=student, subject=payload.subject)
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
        raise
