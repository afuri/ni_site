from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.core import error_codes as codes
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

    async def list(
        self,
        *,
        role=None,
        is_active: bool | None = None,
        is_email_verified: bool | None = None,
        is_moderator: bool | None = None,
        moderator_requested: bool | None = None,
        login: str | None = None,
        email: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[User]:
        stmt = select(User).order_by(User.id).limit(limit).offset(offset)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if is_email_verified is not None:
            stmt = stmt.where(User.is_email_verified == is_email_verified)
        if is_moderator is not None:
            stmt = stmt.where(User.is_moderator == is_moderator)
        if moderator_requested is not None:
            stmt = stmt.where(User.moderator_requested == moderator_requested)
        if login:
            stmt = stmt.where(User.login.ilike(f"%{login}%"))
        if email:
            stmt = stmt.where(User.email.ilike(f"%{email}%"))
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def create(
        self,
        *,
        login: str,
        email: str,
        password_hash: str,
        role,
        is_email_verified: bool,
        is_moderator: bool = False,
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
            is_moderator=is_moderator,
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
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            existing_login = await self.get_by_login(login)
            if existing_login:
                raise ValueError(codes.LOGIN_TAKEN)
            existing_email = await self.get_by_email(email)
            if existing_email:
                raise ValueError(codes.EMAIL_TAKEN)
            raise ValueError(codes.LOGIN_TAKEN)
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

    async def set_password(
        self,
        user: User,
        password_hash: str,
        *,
        must_change_password: bool | None = None,
        temp_password_expires_at=None,
    ) -> User:
        user.password_hash = password_hash
        if must_change_password is not None:
            user.must_change_password = must_change_password
        if temp_password_expires_at is not None:
            user.temp_password_expires_at = temp_password_expires_at
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
