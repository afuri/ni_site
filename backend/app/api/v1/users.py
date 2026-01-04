from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import get_current_user
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users")

ERROR_RESPONSE_401 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "missing_token", "message": "missing_token"}}}},
}

ERROR_RESPONSE_404 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "user_not_found", "message": "user_not_found"}}}},
}

ERROR_RESPONSE_422 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "validation_error", "message": "validation_error"}}}},
}


@router.get(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Получить профиль пользователя",
    responses={
        401: ERROR_RESPONSE_401,
    },
)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.put(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Обновить профиль пользователя",
    responses={
        401: ERROR_RESPONSE_401,
        404: ERROR_RESPONSE_404,
        422: ERROR_RESPONSE_422,
    },
)
async def update_me(
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)

    # Простейшие role-гейты на поля (MVP)
    if user.role != UserRole.teacher:
        data.pop("subject", None)

    repo = UsersRepo(db)
    user = await repo.get_by_id(user.id)
    if not user:
        raise http_error(404, "user_not_found")

    updated = await repo.update_profile(user, data)
    return updated
