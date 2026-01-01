from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole
from app.repos.users import UsersRepo
from app.repos.social_accounts import SocialAccountsRepo
from app.core.security import create_access_token, create_refresh_token
from app.core.security import hash_password


class AuthVKService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UsersRepo(db)
        self.socials = SocialAccountsRepo(db)

    async def login_with_vk(self, *, provider_user_id: str, email: str | None):
        # 1) Если уже привязан social account — логиним
        existing_social = await self.socials.get_by_provider_user("vk", provider_user_id)
        if existing_social:
            user = await self.users.get_by_id(existing_social.user_id)
            if not user or not user.is_active:
                raise ValueError("user_not_found")
            return create_access_token(str(user.id)), create_refresh_token(str(user.id))

        # 2) Иначе создаём нового пользователя (MVP)
        # VK email может быть не всегда. Тогда создаём тех. email.
        norm_email = (email or f"vk_{provider_user_id}@example.invalid").lower()

        # Если email уже занят — используем существующего пользователя и просто привязываем VK
        user = await self.users.get_by_email(norm_email)
        if not user:
            # пароль не нужен, но поле обязательное — кладём случайный хэш
            password_hash = hash_password("vk:" + provider_user_id)
            user = await self.users.create(email=norm_email, password_hash=password_hash, role=UserRole.student)

        await self.socials.create(provider="vk", provider_user_id=provider_user_id, user_id=user.id)
        return create_access_token(str(user.id)), create_refresh_token(str(user.id))
