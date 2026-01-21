from datetime import datetime, timezone, timedelta
import secrets
import string

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.deps import get_db
from app.core.deps_auth import require_role, get_current_user_optional
from app.core.errors import http_error
from app.core.request_id import get_request_id
from app.core.redis import safe_redis
from app.core.security import hash_password, validate_password_policy, hash_token
from app.tasks.email import send_email_task
from app.models.user import UserRole, User
from app.repos.auth_tokens import AuthTokensRepo
from app.repos.audit_logs import AuditLogsRepo
from app.repos.user_changes import UserChangesRepo
from app.repos.users import UsersRepo
from app.schemas.user import (
    UserRead,
    ModeratorStatusUpdate,
    AdminUserUpdate,
    AdminTempPasswordRequest,
    AdminTempPasswordGenerated,
    AdminActionOtpResponse,
)
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import (
    EXAMPLE_ADMIN_OTP_RESPONSE,
    EXAMPLE_ADMIN_TEMP_PASSWORD,
    EXAMPLE_USER_READ,
    EXAMPLE_LISTS,
    response_model_example,
    response_model_list_example,
)
from app.core import error_codes as codes

router = APIRouter(prefix="/admin/users")


def _normalize_query(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized if normalized else None


class AdminActor:
    def __init__(self, *, user: User | None, is_super_admin: bool, label: str):
        self.user = user
        self.is_super_admin = is_super_admin
        self.label = label

    @property
    def id(self) -> int | None:
        return self.user.id if self.user else None

    @property
    def login(self) -> str:
        return self.user.login if self.user else self.label


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.isupper() for c in password)
            and any(c.islower() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password


def _super_admin_logins() -> set[str]:
    return {login.strip().lower() for login in settings.SUPER_ADMIN_LOGINS.split(",") if login.strip()}


def _is_super_admin(user: User) -> bool:
    return user.login.lower() in _super_admin_logins()


def _service_tokens() -> set[str]:
    return {token.strip() for token in settings.SERVICE_TOKENS.split(",") if token.strip()}


def _admin_otp_key(admin_id: int) -> str:
    return f"admin:otp:{admin_id}"


async def _store_admin_otp(admin_id: int, otp: str) -> None:
    redis = await safe_redis()
    if redis is None:
        raise http_error(503, codes.OTP_UNAVAILABLE)
    await redis.set(_admin_otp_key(admin_id), hash_token(otp), ex=settings.ADMIN_ACTION_OTP_TTL_SEC)


async def _verify_admin_otp(admin_id: int, otp: str | None) -> None:
    if not otp:
        raise http_error(403, codes.ADMIN_OTP_REQUIRED)
    redis = await safe_redis()
    if redis is None:
        raise http_error(503, codes.OTP_UNAVAILABLE)
    stored = await redis.get(_admin_otp_key(admin_id))
    if not stored:
        raise http_error(403, codes.ADMIN_OTP_REQUIRED)
    stored_value = stored.decode("utf-8") if isinstance(stored, (bytes, bytearray)) else str(stored)
    if hash_token(otp) != stored_value:
        raise http_error(403, codes.ADMIN_OTP_INVALID)
    await redis.delete(_admin_otp_key(admin_id))


def _requires_admin_otp(user: User, patch: dict) -> bool:
    if user.role != UserRole.admin:
        return False
    return any(field in patch for field in ("role", "is_active"))


async def require_admin_or_service_actor(
    service_token: str | None = Header(default=None, alias="X-Service-Token"),
    user: User | None = Depends(get_current_user_optional),
) -> AdminActor:
    if service_token and service_token in _service_tokens():
        return AdminActor(user=None, is_super_admin=True, label="service")
    if user is None:
        raise http_error(401, codes.MISSING_TOKEN)
    if user.role != UserRole.admin:
        raise http_error(403, codes.FORBIDDEN)
    return AdminActor(user=user, is_super_admin=_is_super_admin(user), label=user.login)


@router.post(
    "/otp",
    response_model=AdminActionOtpResponse,
    tags=["admin"],
    description="Запросить одноразовый код подтверждения для критичных действий",
    responses={
        200: response_model_example(AdminActionOtpResponse, EXAMPLE_ADMIN_OTP_RESPONSE),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        503: response_example(codes.OTP_UNAVAILABLE),
    },
)
async def request_admin_otp(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    otp = "".join(secrets.choice(string.digits) for _ in range(settings.ADMIN_ACTION_OTP_LENGTH))
    await _store_admin_otp(admin.id, otp)
    await AuditLogsRepo(db).create(
        user_id=admin.id,
        action="admin_otp_requested",
        method="POST",
        path="/api/v1/admin/users/otp",
        status_code=200,
        ip=None,
        user_agent=None,
        request_id=get_request_id(),
        details={},
        created_at=datetime.now(timezone.utc),
    )
    if settings.EMAIL_SEND_ENABLED:
        send_email_task.delay(
            admin.email,
            "Код подтверждения",
            f"Код подтверждения: {otp}. Срок действия: {settings.ADMIN_ACTION_OTP_TTL_SEC} сек.",
        )
    if settings.ENV != "prod":
        return {"sent": True, "otp": otp}
    return {"sent": True}


@router.get(
    "",
    response_model=list[UserRead],
    tags=["admin"],
    description="Список пользователей",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["users"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_users(
    user_id: int | None = Query(default=None),
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    is_email_verified: bool | None = Query(default=None),
    must_change_password: bool | None = Query(default=None),
    is_moderator: bool | None = Query(default=None),
    moderator_requested: bool | None = Query(default=None),
    login: str | None = Query(default=None),
    email: str | None = Query(default=None),
    surname: str | None = Query(default=None),
    name: str | None = Query(default=None),
    father_name: str | None = Query(default=None),
    country: str | None = Query(default=None),
    city: str | None = Query(default=None),
    school: str | None = Query(default=None),
    class_grade: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    gender: str | None = Query(default=None, pattern="^(male|female)$"),
    subscription: int | None = Query(default=None, ge=0, le=5),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    return await repo.list(
        user_id=user_id,
        role=role,
        is_active=is_active,
        is_email_verified=is_email_verified,
        must_change_password=must_change_password,
        is_moderator=is_moderator,
        moderator_requested=moderator_requested,
        login=_normalize_query(login),
        email=_normalize_query(email),
        surname=surname,
        name=name,
        father_name=father_name,
        country=country,
        city=city,
        school=school,
        class_grade=class_grade,
        subject=subject,
        gender=gender,
        subscription=subscription,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/count",
    response_model=int,
    tags=["admin"],
    description="Количество пользователей по фильтрам",
    responses={
        200: {"content": {"application/json": {"example": 0}}},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def count_users(
    user_id: int | None = Query(default=None),
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    is_email_verified: bool | None = Query(default=None),
    must_change_password: bool | None = Query(default=None),
    is_moderator: bool | None = Query(default=None),
    moderator_requested: bool | None = Query(default=None),
    login: str | None = Query(default=None),
    email: str | None = Query(default=None),
    surname: str | None = Query(default=None),
    name: str | None = Query(default=None),
    father_name: str | None = Query(default=None),
    country: str | None = Query(default=None),
    city: str | None = Query(default=None),
    school: str | None = Query(default=None),
    class_grade: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    gender: str | None = Query(default=None, pattern="^(male|female)$"),
    subscription: int | None = Query(default=None, ge=0, le=5),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    return await repo.count(
        user_id=user_id,
        role=role,
        is_active=is_active,
        is_email_verified=is_email_verified,
        must_change_password=must_change_password,
        is_moderator=is_moderator,
        moderator_requested=moderator_requested,
        login=_normalize_query(login),
        email=_normalize_query(email),
        surname=surname,
        name=name,
        father_name=father_name,
        country=country,
        city=city,
        school=school,
        class_grade=class_grade,
        subject=subject,
        gender=gender,
        subscription=subscription,
    )


@router.get(
    "/{user_id}",
    response_model=UserRead,
    tags=["admin"],
    description="Получить пользователя по ID",
    responses={
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.USER_NOT_FOUND),
    },
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)
    return user


@router.put(
    "/{user_id}/moderator",
    response_model=UserRead,
    tags=["admin"],
    description="Назначить или снять статус модератора",
    responses={
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
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
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_examples(codes.FORBIDDEN, codes.ADMIN_OTP_REQUIRED, codes.ADMIN_OTP_INVALID),
        404: response_example(codes.USER_NOT_FOUND),
        409: response_examples(codes.LOGIN_TAKEN, codes.USER_NOT_TEACHER),
        422: response_examples(
            codes.VALIDATION_ERROR,
            codes.CLASS_GRADE_REQUIRED,
            codes.SUBJECT_REQUIRED,
            codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT,
            codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER,
        ),
        503: response_example(codes.OTP_UNAVAILABLE),
    },
)
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin_actor: AdminActor = Depends(require_admin_or_service_actor),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    patch = payload.model_dump(exclude_unset=True)
    old_role = user.role
    old_is_active = user.is_active

    if "login" in patch:
        patch_login = patch["login"].strip().lower()
        patch["login"] = patch_login
        if patch_login != user.login.lower():
            existing = await repo.get_by_login(patch_login)
            if existing and existing.id != user.id:
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

    if (
        user.role == UserRole.admin
        and admin_actor.id is not None
        and user.id != admin_actor.id
        and not admin_actor.is_super_admin
        and any(field in patch for field in ("role", "is_active"))
    ):
        raise http_error(403, codes.FORBIDDEN)

    if admin_actor.user is not None and _requires_admin_otp(user, patch):
        await _verify_admin_otp(admin_actor.user.id, patch.get("admin_otp"))
    patch.pop("admin_otp", None)

    if patch.get("must_change_password") is True:
        patch["temp_password_expires_at"] = datetime.now(timezone.utc) + timedelta(
            hours=settings.TEMP_PASSWORD_TTL_HOURS
        )
    if patch.get("must_change_password") is False:
        patch["temp_password_expires_at"] = None

    critical_fields = {"role", "is_active", "is_email_verified", "must_change_password", "login"}
    needs_revoke = any(
        field in patch and getattr(user, field) != patch[field]
        for field in critical_fields
    )

    try:
        updated = await repo.update_profile(user, patch)
    except IntegrityError:
        await db.rollback()
        raise http_error(409, codes.LOGIN_TAKEN)
    await AuditLogsRepo(db).create(
        user_id=admin_actor.id,
        action="admin_user_update",
        method="PUT",
        path=f"/api/v1/admin/users/{user_id}",
        status_code=200,
        ip=None,
        user_agent=None,
        request_id=get_request_id(),
        details={"target_user_id": user_id, "fields": sorted(patch.keys())},
        created_at=datetime.now(timezone.utc),
    )
    await UserChangesRepo(db).create(
        actor_user_id=admin_actor.id,
        target_user_id=user_id,
        action="update",
        details={"fields": sorted(patch.keys())},
        created_at=datetime.now(timezone.utc),
    )
    if needs_revoke:
        await AuthTokensRepo(db).revoke_all_refresh_tokens(user_id, datetime.now(timezone.utc))

    if settings.EMAIL_SEND_ENABLED:
        if old_role != updated.role:
            send_email_task.delay(
                updated.email,
                "Изменение роли",
                f"Ваша роль изменена на {updated.role}.",
            )
        if old_is_active != updated.is_active:
            status_label = "активирован" if updated.is_active else "деактивирован"
            send_email_task.delay(
                updated.email,
                "Статус учетной записи",
                f"Ваш аккаунт был {status_label} администратором.",
            )
    return updated


@router.post(
    "/{user_id}/temp-password",
    response_model=UserRead,
    tags=["admin"],
    description="Назначить временный пароль и потребовать смену при первом входе",
    responses={
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
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
    admin_actor: AdminActor = Depends(require_admin_or_service_actor),
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
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.TEMP_PASSWORD_TTL_HOURS)
    await repo.set_password(
        user,
        password_hash,
        must_change_password=True,
        temp_password_expires_at=expires_at,
    )
    await AuthTokensRepo(db).revoke_all_refresh_tokens(user_id, datetime.now(timezone.utc))
    await AuditLogsRepo(db).create(
        user_id=admin_actor.id,
        action="admin_set_temp_password",
        method="POST",
        path=f"/api/v1/admin/users/{user_id}/temp-password",
        status_code=200,
        ip=None,
        user_agent=None,
        request_id=get_request_id(),
        details={"target_user_id": user_id},
        created_at=datetime.now(timezone.utc),
    )
    await UserChangesRepo(db).create(
        actor_user_id=admin_actor.id,
        target_user_id=user_id,
        action="temp_password_set",
        details={"ttl_hours": settings.TEMP_PASSWORD_TTL_HOURS},
        created_at=datetime.now(timezone.utc),
    )
    if settings.EMAIL_SEND_ENABLED:
        send_email_task.delay(
            user.email,
            "Временный пароль",
            f"Временный пароль: {payload.temp_password}. Срок действия: {settings.TEMP_PASSWORD_TTL_HOURS} ч.",
        )
    return user


@router.post(
    "/{user_id}/temp-password/generate",
    response_model=AdminTempPasswordGenerated,
    tags=["admin"],
    description="Сгенерировать временный пароль и потребовать смену при первом входе",
    responses={
        200: response_model_example(AdminTempPasswordGenerated, EXAMPLE_ADMIN_TEMP_PASSWORD),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.USER_NOT_FOUND),
    },
)
async def generate_temporary_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin_actor: AdminActor = Depends(require_admin_or_service_actor),
):
    repo = UsersRepo(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    temp_password = _generate_temp_password()
    password_hash = hash_password(temp_password)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.TEMP_PASSWORD_TTL_HOURS)
    await repo.set_password(
        user,
        password_hash,
        must_change_password=True,
        temp_password_expires_at=expires_at,
    )
    await AuthTokensRepo(db).revoke_all_refresh_tokens(user_id, datetime.now(timezone.utc))
    await AuditLogsRepo(db).create(
        user_id=admin_actor.id,
        action="admin_generate_temp_password",
        method="POST",
        path=f"/api/v1/admin/users/{user_id}/temp-password/generate",
        status_code=200,
        ip=None,
        user_agent=None,
        request_id=get_request_id(),
        details={"target_user_id": user_id},
        created_at=datetime.now(timezone.utc),
    )
    await UserChangesRepo(db).create(
        actor_user_id=admin_actor.id,
        target_user_id=user_id,
        action="temp_password_generate",
        details={"ttl_hours": settings.TEMP_PASSWORD_TTL_HOURS},
        created_at=datetime.now(timezone.utc),
    )
    if settings.EMAIL_SEND_ENABLED:
        send_email_task.delay(
            user.email,
            "Временный пароль",
            f"Временный пароль: {temp_password}. Срок действия: {settings.TEMP_PASSWORD_TTL_HOURS} ч.",
        )
    return {"temp_password": temp_password}
