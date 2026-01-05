from fastapi import Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.errors import http_error
from app.core.security import decode_token
from app.repos.users import UsersRepo
from app.models.user import User, UserRole
from app.core import error_codes as codes

bearer_scheme = HTTPBearer(auto_error=False)


async def _get_current_user_base(
    creds: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
    *,
    allow_password_change: bool,
) -> User:
    if creds is None or not creds.credentials:
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.MISSING_TOKEN)

    token = creds.credentials
    try:
        payload = decode_token(token)
    except Exception:
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.INVALID_TOKEN)

    if payload.get("type") != "access":
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.INVALID_TOKEN_TYPE)

    sub = payload.get("sub")
    if not sub:
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.INVALID_TOKEN)

    users_repo = UsersRepo(db)
    user = await users_repo.get_by_id(int(sub))
    if not user or not user.is_active:
        raise http_error(status.HTTP_401_UNAUTHORIZED, codes.USER_NOT_FOUND)

    if user.must_change_password and not allow_password_change:
        raise http_error(status.HTTP_403_FORBIDDEN, codes.PASSWORD_CHANGE_REQUIRED)

    return user


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _get_current_user_base(creds, db, allow_password_change=False)


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if creds is None or not creds.credentials:
        return None
    return await _get_current_user_base(creds, db, allow_password_change=False)


async def get_current_user_allow_password_change(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _get_current_user_base(creds, db, allow_password_change=True)


def require_role(*roles: UserRole):
    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise http_error(status.HTTP_403_FORBIDDEN, codes.FORBIDDEN)
        return user
    return _guard


def require_admin_or_moderator():
    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role == UserRole.admin:
            return user
        if user.role == UserRole.teacher and user.is_moderator:
            return user
        raise http_error(status.HTTP_403_FORBIDDEN, codes.FORBIDDEN)
    return _guard
