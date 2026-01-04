from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import get_current_user
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, UserUpdate
from app.api.v1.openapi_errors import response_example

router = APIRouter(prefix="/users")


@router.get(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Получить профиль пользователя",
    responses={
        401: response_example("missing_token"),
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
        401: response_example("missing_token"),
        404: response_example("user_not_found"),
        422: response_example("validation_error"),
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
