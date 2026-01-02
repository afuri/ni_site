from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
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
)
from app.schemas.user import UserRead
from app.core.deps_auth import get_current_user

router = APIRouter(prefix="/auth")


@router.post(
    "/register",
    response_model=UserRead,
    status_code=201,
    tags=["auth"],
    description="Регистрация пользователя",
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
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
            raise HTTPException(status_code=409, detail="login_taken")
        if str(e) == "email_taken":
            raise HTTPException(status_code=409, detail="email_taken")
        if str(e) == "invalid_role":
            raise HTTPException(status_code=422, detail="invalid_role")
        if str(e) in (
            "class_grade_required",
            "subject_required",
            "subject_not_allowed_for_student",
            "class_grade_not_allowed_for_teacher",
        ):
            raise HTTPException(status_code=422, detail=str(e))
        raise
    return user


@router.post(
    "/login",
    response_model=TokenPair,
    tags=["auth"],
    description="Вход по логину и паролю",
)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        access, refresh = await service.login(payload.login, payload.password)
    except ValueError as e:
        if str(e) == "email_not_verified":
            raise HTTPException(status_code=403, detail="email_not_verified")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
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
    db: AsyncSession = Depends(get_db),
):
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
        raise HTTPException(status_code=422, detail="invalid_token")
    return {"status": "ok"}


@router.post(
    "/password/reset/request",
    response_model=MessageResponse,
    tags=["auth"],
    description="Запросить сброс пароля по email",
)
async def request_password_reset(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
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
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(UsersRepo(db), AuthTokensRepo(db))
    try:
        await service.confirm_password_reset(token=payload.token, new_password=payload.new_password)
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_token")
    return {"status": "ok"}
