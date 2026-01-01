"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.repos.users import UsersRepo
from app.services.auth import AuthService
from app.schemas.auth import RegisterRequest, LoginRequest, TokenPair
from app.schemas.user import UserRead
from app.core.deps_auth import get_current_user

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
