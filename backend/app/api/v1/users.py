from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import get_current_user
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.models.user_change import UserChange
from app.repos.users import UsersRepo
from app.repos.announcements import AnnouncementsRepo
from app.schemas.user import UserRead, UserUpdate
from app.schemas.announcements import UserAnnouncementRead
from app.api.v1.openapi_errors import response_example
from app.api.v1.openapi_examples import EXAMPLE_USER_READ, response_model_example
from app.core import error_codes as codes
from app.services.school_profile import SchoolProfileService

router = APIRouter(prefix="/users")


@router.get(
    "/me",
    response_model=UserRead,
    tags=["users"],
    description="Получить профиль пользователя",
    responses={
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
        401: response_example(codes.MISSING_TOKEN),
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
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
        401: response_example(codes.MISSING_TOKEN),
        404: response_example(codes.USER_NOT_FOUND),
        422: response_example(codes.VALIDATION_ERROR),
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
    if user.role != UserRole.student:
        data.pop("manual_teachers", None)
    # Подписка пока системная, не редактируется с фронта
    data.pop("subscription", None)

    repo = UsersRepo(db)
    user = await repo.get_by_id(user.id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    try:
        data = await SchoolProfileService(db).apply_profile_fields(
            user,
            data,
            allow_selected_geography_change=True,
        )
        if any(data.get(field, getattr(user, field)) != getattr(user, field) for field in ("region_id", "school_id", "school_status")):
            db.add(
                UserChange(
                    actor_user_id=user.id,
                    target_user_id=user.id,
                    action="user_school_changed",
                    details={"region_id": data.get("region_id", user.region_id), "school_id": data.get("school_id", user.school_id)},
                )
            )
        updated = await repo.update_profile(user, data)
    except ValueError as exc:
        code = str(exc)
        if code in {codes.REGION_NOT_FOUND, codes.SCHOOL_NOT_FOUND}:
            raise http_error(404, code)
        if code in {
            codes.REGION_INACTIVE,
            codes.SCHOOL_INACTIVE,
            codes.SCHOOL_REGION_MISMATCH,
            codes.SCHOOL_SELECTION_REQUIRED,
            codes.CLASS_GRADE_REQUIRED,
            codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER,
        }:
            raise http_error(422, code)
        raise
    return updated


@router.get(
    "/me/announcements",
    response_model=list[UserAnnouncementRead],
    tags=["users"],
    description="Получить объявления для текущего пользователя",
    responses={
        401: response_example(codes.MISSING_TOKEN),
    },
)
async def get_my_announcements(
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.student:
        return []
    repo = AnnouncementsRepo(db)
    return await repo.get_user_announcements(user.id)
