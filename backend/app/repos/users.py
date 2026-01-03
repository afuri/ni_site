from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


class UsersRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_login(self, login: str) -> User | None:
        res = await self.db.execute(select(User).where(User.login == login))
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def get_by_id(self, user_id: int) -> User | None:
        res = await self.db.execute(select(User).where(User.id == user_id))
        return res.scalar_one_or_none()

    async def create(
        self,
        *,
        login: str,
        email: str,
        password_hash: str,
        role,
        is_email_verified: bool,
        surname: str,
        name: str,
        father_name: str | None,
        country: str,
        city: str,
        school: str,
        class_grade: int | None,
        subject: str | None,
    ) -> User:
        user = User(
            login=login,
            email=email,
            password_hash=password_hash,
            role=role,
            is_active=True,
            is_email_verified=is_email_verified,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=class_grade,
            subject=subject,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update_profile(self, user: User, data: dict) -> User:
        for k, v in data.items():
            setattr(user, k, v)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def set_email_verified(self, user: User) -> User:
        user.is_email_verified = True
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def set_password(self, user: User, password_hash: str) -> User:
        user.password_hash = password_hash
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def set_moderator_request(self, user: User, requested: bool) -> User:
        user.moderator_requested = requested
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def set_moderator_status(self, user: User, is_moderator: bool) -> User:
        user.is_moderator = is_moderator
        user.moderator_requested = False
        await self.db.commit()
        await self.db.refresh(user)
        return user
