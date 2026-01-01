from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.models.user import UserRole
from app.repos.users import UsersRepo


class AuthService:
    def __init__(self, users_repo: UsersRepo):
        self.users_repo = users_repo

    async def register(self, login: str, password: str, role: str, email: str | None):
        existing = await self.users_repo.get_by_login(login)
        if existing:
            raise ValueError("login_taken")

        try:
            role_enum = UserRole(role)
        except Exception:
            raise ValueError("invalid_role")

        password_hash = hash_password(password)
        user = await self.users_repo.create(login=login, email=email, password_hash=password_hash, role=role_enum)
        return user

    async def login(self, login: str, password: str):
        user = await self.users_repo.get_by_login(login)
        if not user or not user.is_active:
            raise ValueError("invalid_credentials")

        if not verify_password(password, user.password_hash):
            raise ValueError("invalid_credentials")

        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id))
        return access, refresh
