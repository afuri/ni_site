from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import get_current_user
from app.models.user import User, UserRole
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users")


@router.get(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Получить профиль пользователя",
)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.put(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Обновить профиль пользователя",
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
        raise HTTPException(status_code=404, detail="user_not_found")

    updated = await repo.update_profile(user, data)
    return updated
