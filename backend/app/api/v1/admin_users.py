from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole, User
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, ModeratorStatusUpdate
from app.api.v1.openapi_errors import response_example
from app.core import error_codes as codes

router = APIRouter(prefix="/admin/users")


@router.put(
    "/{user_id}/moderator",
    response_model=UserRead,
    tags=["admin"],
    description="Назначить или снять статус модератора",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.USER_NOT_FOUND),
        409: response_example(codes.USER_NOT_TEACHER),
    },
)
async def set_moderator_status(
    user_id: int,
    payload: ModeratorStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)
    if user.role != UserRole.teacher:
        raise http_error(409, codes.USER_NOT_TEACHER)
    return await repo.set_moderator_status(user, payload.is_moderator)
