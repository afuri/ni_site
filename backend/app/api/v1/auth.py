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
    PasswordChangeRequest,
    MessageResponse,
    RefreshTokenRequest,
)
from app.schemas.user import UserRead
from app.core.deps_auth import get_current_user, get_current_user_allow_password_change
from app.core.security import verify_password, hash_password, validate_password_policy
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import EXAMPLE_TOKEN_PAIR, EXAMPLE_USER_READ, response_model_example
from app.core import error_codes as codes

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
        raise http_error(status.HTTP_429_TOO_MANY_REQUESTS, codes.RATE_LIMITED)


@router.post(
    "/register",
    response_model=UserRead,
    status_code=201,
    tags=["auth"],
    description="Регистрация пользователя",
    responses={
        201: response_model_example(UserRead, EXAMPLE_USER_READ),
        409: response_examples(codes.LOGIN_TAKEN, codes.EMAIL_TAKEN),
        422: response_examples(codes.VALIDATION_ERROR, codes.WEAK_PASSWORD),
    },
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
        if str(e) == codes.LOGIN_TAKEN:
            raise http_error(409, codes.LOGIN_TAKEN)
        if str(e) == codes.EMAIL_TAKEN:
            raise http_error(409, codes.EMAIL_TAKEN)
        if str(e) == codes.INVALID_ROLE:
            raise http_error(422, codes.INVALID_ROLE)
        if str(e) in (
            codes.CLASS_GRADE_REQUIRED,
            codes.SUBJECT_REQUIRED,
            codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT,
            codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER,
            codes.WEAK_PASSWORD,
        ):
            raise http_error(422, str(e))
        raise
    return user


@router.post(
    "/login",
    response_model=TokenPair,
    tags=["auth"],
    description="Вход по логину и паролю",
    responses={
        200: response_model_example(TokenPair, EXAMPLE_TOKEN_PAIR),
        401: response_example(codes.INVALID_CREDENTIALS),
        422: response_example(codes.VALIDATION_ERROR),
        409: response_example(codes.TEMP_PASSWORD_EXPIRED),
    },
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
        access, refresh, must_change_password = await service.login(payload.login, payload.password)
    except ValueError as e:
        if str(e) == codes.TEMP_PASSWORD_EXPIRED:
            raise http_error(409, codes.TEMP_PASSWORD_EXPIRED)
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.INVALID_CREDENTIALS)
    return TokenPair(access_token=access, refresh_token=refresh, must_change_password=must_change_password)


@router.get(
    "/me",
    response_model=UserRead,
    tags=["auth"],
    description="Получить профиль текущего пользователя",
    responses={
        200: response_model_example(UserRead, EXAMPLE_USER_READ),
    },
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
    responses={
        422: response_example(codes.INVALID_TOKEN),
    },
)
async def confirm_email_verification(
    payload: EmailVerificationConfirm,
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        await service.verify_email(token=payload.token)
    except ValueError:
        raise http_error(422, codes.INVALID_TOKEN)
    return {"status": "ok"}


@router.post(
    "/password/change",
    response_model=MessageResponse,
    tags=["auth"],
    description="Сменить пароль текущего пользователя",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.INVALID_CURRENT_PASSWORD),
        422: response_example(codes.WEAK_PASSWORD),
        429: response_example(codes.RATE_LIMITED),
    },
)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user_allow_password_change),
):
    await _apply_rate_limit(
        request,
        key_prefix="auth:password-change",
        limit=settings.AUTH_PASSWORD_CHANGE_RL_LIMIT,
        window_sec=settings.AUTH_PASSWORD_CHANGE_RL_WINDOW_SEC,
        identity=str(user.id),
    )
    if not verify_password(payload.current_password, user.password_hash):
        raise http_error(403, codes.INVALID_CURRENT_PASSWORD)
    try:
        validate_password_policy(payload.new_password)
    except ValueError:
        raise http_error(422, codes.WEAK_PASSWORD)
    password_hash = hash_password(payload.new_password)
    await UsersRepo(db).set_password(
        user,
        password_hash,
        must_change_password=False,
        temp_password_expires_at=None,
    )
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
    responses={
        422: response_examples(codes.INVALID_TOKEN, codes.WEAK_PASSWORD),
    },
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
        if str(e) == codes.WEAK_PASSWORD:
            raise http_error(422, codes.WEAK_PASSWORD)
        raise http_error(422, codes.INVALID_TOKEN)
    return {"status": "ok"}


@router.post(
    "/refresh",
    response_model=TokenPair,
    tags=["auth"],
    description="Обновить access и refresh токены",
    responses={
        200: response_model_example(TokenPair, EXAMPLE_TOKEN_PAIR),
        422: response_example(codes.INVALID_TOKEN),
        409: response_example(codes.TEMP_PASSWORD_EXPIRED),
    },
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
        access, refresh, must_change_password = await service.refresh_tokens(refresh_token=payload.refresh_token)
    except ValueError as e:
        code = str(e)
        if code == codes.TEMP_PASSWORD_EXPIRED:
            raise http_error(409, codes.TEMP_PASSWORD_EXPIRED)
        if code == codes.INVALID_TOKEN_TYPE:
            raise http_error(422, codes.INVALID_TOKEN_TYPE)
        raise http_error(422, codes.INVALID_TOKEN)
    return TokenPair(access_token=access, refresh_token=refresh, must_change_password=must_change_password)


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
