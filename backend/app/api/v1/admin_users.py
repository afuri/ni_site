from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.core.security import hash_password, validate_password_policy
from app.models.user import UserRole, User
from app.repos.auth_tokens import AuthTokensRepo
from app.repos.users import UsersRepo
from app.schemas.user import UserRead, ModeratorStatusUpdate, AdminUserUpdate, AdminTempPasswordRequest
from app.api.v1.openapi_errors import response_example, response_examples
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


@router.put(
    "/{user_id}",
    response_model=UserRead,
    tags=["admin"],
    description="Обновить пользователя (админ, кроме email)",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.USER_NOT_FOUND),
        409: response_examples(codes.LOGIN_TAKEN, codes.USER_NOT_TEACHER),
        422: response_examples(
            codes.VALIDATION_ERROR,
            codes.CLASS_GRADE_REQUIRED,
            codes.SUBJECT_REQUIRED,
            codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT,
            codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER,
        ),
    },
)
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    patch = payload.model_dump(exclude_unset=True)

    if "login" in patch and patch["login"] != user.login:
        existing = await repo.get_by_login(patch["login"])
        if existing:
            raise http_error(409, codes.LOGIN_TAKEN)

    new_role = patch.get("role", user.role)
    requested_is_moderator = payload.is_moderator
    new_subject = patch.get("subject", user.subject)
    new_class_grade = patch.get("class_grade", user.class_grade)

    if new_role == UserRole.student:
        if new_class_grade is None:
            raise http_error(422, codes.CLASS_GRADE_REQUIRED)
        if "subject" in patch and patch["subject"] is not None:
            raise http_error(422, codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT)
        patch["subject"] = None
        patch["is_moderator"] = False
        patch["moderator_requested"] = False
    elif new_role == UserRole.teacher:
        if new_subject is None:
            raise http_error(422, codes.SUBJECT_REQUIRED)
        if "class_grade" in patch and patch["class_grade"] is not None:
            raise http_error(422, codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER)
        patch["class_grade"] = None
    elif new_role == UserRole.admin:
        patch["subject"] = None
        patch["class_grade"] = None
        patch["is_moderator"] = False
        patch["moderator_requested"] = False

    if requested_is_moderator and new_role != UserRole.teacher:
        raise http_error(409, codes.USER_NOT_TEACHER)

    return await repo.update_profile(user, patch)


@router.post(
    "/{user_id}/temp-password",
    response_model=UserRead,
    tags=["admin"],
    description="Назначить временный пароль и потребовать смену при первом входе",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.USER_NOT_FOUND),
        422: response_example(codes.WEAK_PASSWORD),
    },
)
async def set_temporary_password(
    user_id: int,
    payload: AdminTempPasswordRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    try:
        validate_password_policy(payload.temp_password)
    except ValueError:
        raise http_error(422, codes.WEAK_PASSWORD)
    password_hash = hash_password(payload.temp_password)
    await repo.set_password(user, password_hash, must_change_password=True)
    await AuthTokensRepo(db).revoke_all_refresh_tokens(user_id, datetime.now(timezone.utc))
    return user
