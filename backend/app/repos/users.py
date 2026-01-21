from __future__ import annotations

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.core import error_codes as codes
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, Gender


class UsersRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _normalize_login(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalize_email(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalize_gender(value: str | None) -> Gender | None:
        if value is None:
            return None
        mapping = {
            "муж": "male",
            "м": "male",
            "male": "male",
            "m": "male",
            "жен": "female",
            "ж": "female",
            "female": "female",
            "f": "female",
        }
        norm = mapping.get(value.lower(), value)
        return Gender(norm)

    async def get_by_login(self, login: str) -> User | None:
        login_value = self._normalize_login(login)
        res = await self.db.execute(select(User).where(func.lower(User.login) == login_value))
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        email_value = self._normalize_email(email)
        res = await self.db.execute(select(User).where(func.lower(User.email) == email_value))
        return res.scalar_one_or_none()

    async def get_by_id(self, user_id: int) -> User | None:
        res = await self.db.execute(select(User).where(User.id == user_id))
        return res.scalar_one_or_none()

    async def list(
        self,
        *,
        user_id: int | None = None,
        role=None,
        is_active: bool | None = None,
        is_email_verified: bool | None = None,
        must_change_password: bool | None = None,
        is_moderator: bool | None = None,
        moderator_requested: bool | None = None,
        login: str | None = None,
        email: str | None = None,
        surname: str | None = None,
        name: str | None = None,
        father_name: str | None = None,
        country: str | None = None,
        city: str | None = None,
        school: str | None = None,
        class_grade: int | None = None,
        subject: str | None = None,
        gender: str | None = None,
        subscription: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[User]:
        stmt = select(User).order_by(User.id).limit(limit).offset(offset)
        stmt = self._apply_filters(
            stmt,
            user_id=user_id,
            role=role,
            is_active=is_active,
            is_email_verified=is_email_verified,
            must_change_password=must_change_password,
            is_moderator=is_moderator,
            moderator_requested=moderator_requested,
            login=login,
            email=email,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=class_grade,
            subject=subject,
            gender=gender,
            subscription=subscription,
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def count(
        self,
        *,
        user_id: int | None = None,
        role=None,
        is_active: bool | None = None,
        is_email_verified: bool | None = None,
        must_change_password: bool | None = None,
        is_moderator: bool | None = None,
        moderator_requested: bool | None = None,
        login: str | None = None,
        email: str | None = None,
        surname: str | None = None,
        name: str | None = None,
        father_name: str | None = None,
        country: str | None = None,
        city: str | None = None,
        school: str | None = None,
        class_grade: int | None = None,
        subject: str | None = None,
        gender: str | None = None,
        subscription: int | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(User)
        stmt = self._apply_filters(
            stmt,
            user_id=user_id,
            role=role,
            is_active=is_active,
            is_email_verified=is_email_verified,
            must_change_password=must_change_password,
            is_moderator=is_moderator,
            moderator_requested=moderator_requested,
            login=login,
            email=email,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=class_grade,
            subject=subject,
            gender=gender,
            subscription=subscription,
        )
        res = await self.db.execute(stmt)
        return int(res.scalar_one())

    def _apply_filters(
        self,
        stmt,
        *,
        user_id: int | None,
        role,
        is_active: bool | None,
        is_email_verified: bool | None,
        must_change_password: bool | None,
        is_moderator: bool | None,
        moderator_requested: bool | None,
        login: str | None,
        email: str | None,
        surname: str | None,
        name: str | None,
        father_name: str | None,
        country: str | None,
        city: str | None,
        school: str | None,
        class_grade: int | None,
        subject: str | None,
        gender: str | None,
        subscription: int | None,
    ):
        if user_id is not None:
            stmt = stmt.where(User.id == user_id)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if is_email_verified is not None:
            stmt = stmt.where(User.is_email_verified == is_email_verified)
        if must_change_password is not None:
            stmt = stmt.where(User.must_change_password == must_change_password)
        if is_moderator is not None:
            stmt = stmt.where(User.is_moderator == is_moderator)
        if moderator_requested is not None:
            stmt = stmt.where(User.moderator_requested == moderator_requested)
        if login:
            stmt = stmt.where(User.login.ilike(f"%{login}%"))
        if email:
            stmt = stmt.where(User.email.ilike(f"%{email}%"))
        if surname:
            stmt = stmt.where(User.surname.ilike(f"%{surname}%"))
        if name:
            stmt = stmt.where(User.name.ilike(f"%{name}%"))
        if father_name:
            stmt = stmt.where(User.father_name.ilike(f"%{father_name}%"))
        if country:
            stmt = stmt.where(User.country.ilike(f"%{country}%"))
        if city:
            stmt = stmt.where(User.city.ilike(f"%{city}%"))
        if school:
            stmt = stmt.where(User.school.ilike(f"%{school}%"))
        if class_grade is not None:
            stmt = stmt.where(User.class_grade == class_grade)
        if subject:
            stmt = stmt.where(User.subject.ilike(f"%{subject}%"))
        if gender:
            try:
                stmt = stmt.where(User.gender == Gender(gender))
            except Exception:
                stmt = stmt.where(User.gender == gender)
        if subscription is not None:
            stmt = stmt.where(User.subscription == subscription)
        return stmt

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
        gender: str | None,
        subscription: int,
        manual_teachers: list[dict] | None = None,
    ) -> User:
        gender_value = self._normalize_gender(gender)
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
            gender=gender_value,
            subscription=subscription,
            manual_teachers=manual_teachers or [],
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
