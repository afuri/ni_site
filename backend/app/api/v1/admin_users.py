from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.models.user import UserRole, User
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, ModeratorStatusUpdate

router = APIRouter(prefix="/admin/users")


@router.put(
    "/{user_id}/moderator",
    response_model=UserRead,
    tags=["admin"],
    description="Назначить или снять статус модератора",
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
        raise HTTPException(status_code=404, detail="user_not_found")
    if user.role != UserRole.teacher:
        raise HTTPException(status_code=409, detail="user_not_teacher")
    return await repo.set_moderator_status(user, payload.is_moderator)
