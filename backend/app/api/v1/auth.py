from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.errors import http_error
from app.core.redis import get_redis
from app.core.rate_limit import token_bucket_rate_limit
from app.core.config import settings
from app.core.metrics import RATE_LIMIT_BLOCKS
from app.repos.users import UsersRepo
from app.repos.auth_tokens import AuthTokensRepo
from app.services.auth import AuthService
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenPair,
    EmailVerificationRequest,
    EmailVerificationConfirm,
    PasswordResetRequest,
    PasswordResetConfirm,
    MessageResponse,
    RefreshTokenRequest,
)
from app.schemas.user import UserRead
from app.core.deps_auth import get_current_user

router = APIRouter(prefix="/auth")


async def _apply_rate_limit(
    request: Request,
    *,
    key_prefix: str,
    limit: int,
    window_sec: int,
    identity: str | None = None,
) -> None:
    try:
        redis = await get_redis()
    except Exception:
        return

    ip = request.client.host if request.client else "unknown"
    ident = identity or "anon"
    key = f"rl:{key_prefix}:{ip}:{ident}"

    try:
        rl = await token_bucket_rate_limit(
            redis,
            key=key,
            capacity=limit,
            window_sec=window_sec,
            cost=1,
        )
    except Exception:
        return

    if not rl.allowed:
        RATE_LIMIT_BLOCKS.labels(scope=key_prefix).inc()
        raise http_error(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited")


@router.post(
    "/register",
    response_model=UserRead,
    status_code=201,
    tags=["auth"],
    description="Регистрация пользователя",
)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:register",
        limit=settings.AUTH_REGISTER_RL_LIMIT,
        window_sec=settings.AUTH_REGISTER_RL_WINDOW_SEC,
        identity=payload.login,
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        user = await service.register(
            payload.login,
            payload.password,
            payload.role,
            payload.email,
            surname=payload.surname,
            name=payload.name,
            father_name=payload.father_name,
            country=payload.country,
            city=payload.city,
            school=payload.school,
            class_grade=payload.class_grade,
            subject=payload.subject,
        )
    except ValueError as e:
        if str(e) == "login_taken":
            raise http_error(409, "login_taken")
        if str(e) == "email_taken":
            raise http_error(409, "email_taken")
        if str(e) == "invalid_role":
            raise http_error(422, "invalid_role")
        if str(e) in (
            "class_grade_required",
            "subject_required",
            "subject_not_allowed_for_student",
            "class_grade_not_allowed_for_teacher",
            "weak_password",
        ):
            raise http_error(422, str(e))
        raise
    return user


@router.post(
    "/login",
    response_model=TokenPair,
    tags=["auth"],
    description="Вход по логину и паролю",
)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:login",
        limit=settings.AUTH_LOGIN_RL_LIMIT,
        window_sec=settings.AUTH_LOGIN_RL_WINDOW_SEC,
        identity=payload.login,
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        access, refresh = await service.login(payload.login, payload.password)
    except ValueError as e:
        if str(e) == "email_not_verified":
            raise http_error(403, "email_not_verified")
        raise http_error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")
    return TokenPair(access_token=access, refresh_token=refresh)


@router.get(
    "/me",
    response_model=UserRead,
    tags=["auth"],
    description="Получить профиль текущего пользователя",
)
async def me(user=Depends(get_current_user)):
    return user


@router.post(
    "/verify/request",
    response_model=MessageResponse,
    tags=["auth"],
    description="Запросить письмо для подтверждения email",
)
async def request_email_verification(
    payload: EmailVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:verify",
        limit=settings.AUTH_VERIFY_RL_LIMIT,
        window_sec=settings.AUTH_VERIFY_RL_WINDOW_SEC,
        identity=payload.email,
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    await service.request_email_verification(email=payload.email)
    return {"status": "ok"}


@router.post(
    "/verify/confirm",
    response_model=MessageResponse,
    tags=["auth"],
    description="Подтвердить email по токену",
)
async def confirm_email_verification(
    payload: EmailVerificationConfirm,
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        await service.verify_email(token=payload.token)
    except ValueError:
        raise http_error(422, "invalid_token")
    return {"status": "ok"}


@router.post(
    "/password/reset/request",
    response_model=MessageResponse,
    tags=["auth"],
    description="Запросить сброс пароля по email",
)
async def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:reset",
        limit=settings.AUTH_RESET_RL_LIMIT,
        window_sec=settings.AUTH_RESET_RL_WINDOW_SEC,
        identity=payload.email,
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    await service.request_password_reset(email=payload.email)
    return {"status": "ok"}


@router.post(
    "/password/reset/confirm",
    response_model=MessageResponse,
    tags=["auth"],
    description="Сбросить пароль по токену",
)
async def confirm_password_reset(
    payload: PasswordResetConfirm,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:reset-confirm",
        limit=settings.AUTH_RESET_RL_LIMIT,
        window_sec=settings.AUTH_RESET_RL_WINDOW_SEC,
        identity="token",
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        await service.confirm_password_reset(token=payload.token, new_password=payload.new_password)
    except ValueError as e:
        if str(e) == "weak_password":
            raise http_error(422, "weak_password")
        raise http_error(422, "invalid_token")
    return {"status": "ok"}


@router.post(
    "/refresh",
    response_model=TokenPair,
    tags=["auth"],
    description="Обновить access и refresh токены",
)
async def refresh_tokens(
    payload: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:refresh",
        limit=settings.AUTH_LOGIN_RL_LIMIT,
        window_sec=settings.AUTH_LOGIN_RL_WINDOW_SEC,
        identity="refresh",
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        access, refresh = await service.refresh_tokens(refresh_token=payload.refresh_token)
    except ValueError as e:
        code = str(e)
        if code == "invalid_token_type":
            raise http_error(422, "invalid_token_type")
        raise http_error(422, "invalid_token")
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post(
    "/logout",
    response_model=MessageResponse,
    tags=["auth"],
    description="Отозвать refresh токен",
)
async def logout(
    payload: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:logout",
        limit=settings.AUTH_LOGIN_RL_LIMIT,
        window_sec=settings.AUTH_LOGIN_RL_WINDOW_SEC,
        identity="logout",
    )
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    await service.logout(refresh_token=payload.refresh_token)
    return {"status": "ok"}
