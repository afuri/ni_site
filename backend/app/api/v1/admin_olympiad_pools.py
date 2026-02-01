from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.repos.olympiad_assignments import OlympiadAssignmentsRepo
from app.repos.olympiad_pools import OlympiadPoolsRepo
from app.repos.olympiads import OlympiadsRepo
from app.schemas.olympiad_pools import OlympiadPoolCreate, OlympiadPoolRead
from app.services.olympiad_pools import OlympiadPoolsService
from app.api.v1.openapi_errors import response_example, response_examples


router = APIRouter(prefix="/admin/olympiad-pools")


@router.post(
    "",
    response_model=OlympiadPoolRead,
    status_code=201,
    tags=["admin"],
    description="Создать пул олимпиад",
    responses={
        201: {},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
        422: response_examples(codes.INVALID_SUBJECT, codes.INVALID_AGE_GROUP, codes.OLYMPIAD_POOL_EMPTY),
    },
)
async def create_pool(
    payload: OlympiadPoolCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    service = OlympiadPoolsService(
        OlympiadPoolsRepo(db), OlympiadAssignmentsRepo(db), OlympiadsRepo(db)
    )
    try:
        pool, items = await service.create_pool(
            subject=payload.subject,
            grade_group=payload.grade_group,
            olympiad_ids=payload.olympiad_ids,
            activate=payload.activate,
            admin_id=admin.id,
        )
    except ValueError as e:
        code = str(e)
        if code == codes.INVALID_SUBJECT:
            raise http_error(422, codes.INVALID_SUBJECT)
        if code == codes.INVALID_AGE_GROUP:
            raise http_error(422, codes.INVALID_AGE_GROUP)
        if code == codes.OLYMPIAD_POOL_EMPTY:
            raise http_error(422, codes.OLYMPIAD_POOL_EMPTY)
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        raise

    return {
        "id": pool.id,
        "subject": pool.subject,
        "grade_group": pool.grade_group,
        "is_active": pool.is_active,
        "created_by_user_id": pool.created_by_user_id,
        "created_at": pool.created_at,
        "olympiad_ids": [item.olympiad_id for item in items],
    }


@router.get(
    "",
    response_model=list[OlympiadPoolRead],
    tags=["admin"],
    description="Список пулов олимпиад",
    responses={
        200: {},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_pools(
    subject: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    service = OlympiadPoolsService(
        OlympiadPoolsRepo(db), OlympiadAssignmentsRepo(db), OlympiadsRepo(db)
    )
    try:
        return await service.list_pools(subject=subject, limit=limit, offset=offset)
    except ValueError as e:
        if str(e) == codes.INVALID_SUBJECT:
            raise http_error(422, codes.INVALID_SUBJECT)
        raise


@router.post(
    "/{pool_id}/activate",
    response_model=OlympiadPoolRead,
    tags=["admin"],
    description="Активировать пул олимпиад",
    responses={
        200: {},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_POOL_NOT_FOUND),
    },
)
async def activate_pool(
    pool_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    service = OlympiadPoolsService(
        OlympiadPoolsRepo(db), OlympiadAssignmentsRepo(db), OlympiadsRepo(db)
    )
    try:
        return await service.activate_pool(pool_id)
    except ValueError as e:
        if str(e) == codes.OLYMPIAD_POOL_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_POOL_NOT_FOUND)
        raise
