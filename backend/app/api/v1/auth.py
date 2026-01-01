"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.repos.users import UsersRepo
from app.services.auth import AuthService
from app.schemas.auth import RegisterRequest, LoginRequest, TokenPair
from app.schemas.user import UserRead
from app.core.deps_auth import get_current_user
from fastapi.responses import RedirectResponse
from app.services.vk_oauth import build_authorize_url, validate_state_jwt, exchange_code_for_token
from app.services.auth_vk import AuthVKService

router = APIRouter(prefix="/auth")


@router.post("/register", response_model=UserRead, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(UsersRepo(db))
    try:
        user = await service.register(payload.email, payload.password, payload.role)
    except ValueError as e:
        if str(e) == "email_taken":
            raise HTTPException(status_code=409, detail="email_taken")
        if str(e) == "invalid_role":
            raise HTTPException(status_code=422, detail="invalid_role")
        raise
    return user


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(UsersRepo(db))
    try:
        access, refresh = await service.login(payload.email, payload.password)
    except ValueError as e:
        if str(e) == "invalid_credentials":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
        raise
    return TokenPair(access_token=access, refresh_token=refresh)


@router.get("/me", response_model=UserRead)
async def me(user=Depends(get_current_user)):
    return user


@router.get("/vk/start")
async def vk_start():
    url = build_authorize_url()
    return RedirectResponse(url=url, status_code=302)


@router.get("/vk/callback", response_model=TokenPair)
async def vk_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    # Проверяем state (без хранения, JWT c TTL)
    validate_state_jwt(state)

    token_data = await exchange_code_for_token(code)
    # Ожидаемые поля: access_token, user_id, (иногда) email :contentReference[oaicite:3]{index=3}
    vk_user_id = str(token_data.get("user_id") or "")
    if not vk_user_id:
        raise HTTPException(status_code=400, detail="vk_missing_user_id")

    email = token_data.get("email")  # может отсутствовать
    service = AuthVKService(db)
    try:
        access, refresh = await service.login_with_vk(provider_user_id=vk_user_id, email=email)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    return TokenPair(access_token=access, refresh_token=refresh)
