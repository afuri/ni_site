from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.email import build_reset_link, build_verify_link
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_token,
    hash_token,
    validate_password_policy,
)
from app.models.user import UserRole
from app.repos.auth_tokens import AuthTokensRepo
from app.repos.users import UsersRepo
from app.tasks.email import send_email_task


class AuthService:
    def __init__(self, users_repo: UsersRepo, tokens_repo: AuthTokensRepo):
        self.users_repo = users_repo
        self.tokens_repo = tokens_repo

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(timezone.utc)

    async def register(
        self,
        login: str,
        password: str,
        role: str,
        email: str,
        *,
        surname: str,
        name: str,
        father_name: str | None,
        country: str,
        city: str,
        school: str,
        class_grade: int | None,
        subject: str | None,
    ):
        existing = await self.users_repo.get_by_login(login)
        if existing:
            raise ValueError("login_taken")

        existing_email = await self.users_repo.get_by_email(email)
        if existing_email:
            raise ValueError("email_taken")

        try:
            role_enum = UserRole(role)
        except Exception:
            raise ValueError("invalid_role")

        if role_enum not in (UserRole.student, UserRole.teacher):
            raise ValueError("invalid_role")

        if role_enum == UserRole.student:
            if class_grade is None:
                raise ValueError("class_grade_required")
            if subject is not None:
                raise ValueError("subject_not_allowed_for_student")
        if role_enum == UserRole.teacher:
            if subject is None:
                raise ValueError("subject_required")
            if class_grade is not None:
                raise ValueError("class_grade_not_allowed_for_teacher")

        validate_password_policy(password)
        password_hash = hash_password(password)
        user = await self.users_repo.create(
            login=login,
            email=email,
            password_hash=password_hash,
            role=role_enum,
            is_email_verified=False,
            surname=surname,
            name=name,
            father_name=father_name,
            country=country,
            city=city,
            school=school,
            class_grade=class_grade,
            subject=subject,
        )
        await self.request_email_verification(email=email)
        return user

    async def login(self, login: str, password: str):
        user = await self.users_repo.get_by_login(login)
        if not user or not user.is_active:
            raise ValueError("invalid_credentials")

        if not user.is_email_verified:
            raise ValueError("email_not_verified")

        if not verify_password(password, user.password_hash):
            raise ValueError("invalid_credentials")

        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id))

        now = self._now_utc()
        token_hash = hash_token(refresh)
        expires_at = now + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
        await self.tokens_repo.create_refresh_token(
            user_id=user.id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires_at,
        )
        return access, refresh

    async def refresh_tokens(self, *, refresh_token: str):
        try:
            payload = decode_token(refresh_token)
        except Exception:
            raise ValueError("invalid_token")

        if payload.get("type") != "refresh":
            raise ValueError("invalid_token_type")

        sub = payload.get("sub")
        if not sub:
            raise ValueError("invalid_token")

        token_hash = hash_token(refresh_token)
        record = await self.tokens_repo.get_refresh_by_hash(token_hash)
        if not record:
            raise ValueError("invalid_token")

        now = self._now_utc()
        if record.revoked_at is not None or record.expires_at < now:
            raise ValueError("invalid_token")

        user = await self.users_repo.get_by_id(record.user_id)
        if not user or not user.is_active:
            raise ValueError("invalid_token")

        await self.tokens_repo.revoke_refresh_token(record, now)

        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id))
        new_hash = hash_token(refresh)
        expires_at = now + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
        await self.tokens_repo.create_refresh_token(
            user_id=user.id,
            token_hash=new_hash,
            created_at=now,
            expires_at=expires_at,
        )
        return access, refresh

    async def logout(self, *, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        record = await self.tokens_repo.get_refresh_by_hash(token_hash)
        if not record:
            return
        if record.revoked_at is not None:
            return
        await self.tokens_repo.revoke_refresh_token(record, self._now_utc())

    async def request_email_verification(self, *, email: str) -> None:
        user = await self.users_repo.get_by_email(email)
        if not user:
            return
        if user.is_email_verified:
            return

        await self.tokens_repo.delete_email_verifications(user.id)
        token = generate_token()
        token_hash = hash_token(token)
        now = self._now_utc()
        expires_at = now + timedelta(hours=settings.EMAIL_VERIFY_TTL_HOURS)
        await self.tokens_repo.create_email_verification(
            user_id=user.id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires_at,
        )

        if settings.EMAIL_SEND_ENABLED:
            link = build_verify_link(token)
            body = f"Подтвердите email по ссылке: {link}"
            send_email_task.delay(user.email, "Подтверждение email", body)

    async def verify_email(self, *, token: str) -> None:
        token_hash = hash_token(token)
        record = await self.tokens_repo.get_email_verification_by_hash(token_hash)
        if not record:
            raise ValueError("invalid_token")

        now = self._now_utc()
        if record.used_at is not None:
            return
        if record.expires_at < now:
            raise ValueError("invalid_token")

        user = await self.users_repo.get_by_id(record.user_id)
        if not user:
            raise ValueError("invalid_token")

        await self.tokens_repo.mark_email_verification_used(record, now)
        await self.users_repo.set_email_verified(user)

    async def request_password_reset(self, *, email: str) -> None:
        user = await self.users_repo.get_by_email(email)
        if not user:
            return

        await self.tokens_repo.delete_password_resets(user.id)
        token = generate_token()
        token_hash = hash_token(token)
        now = self._now_utc()
        expires_at = now + timedelta(hours=settings.PASSWORD_RESET_TTL_HOURS)
        await self.tokens_repo.create_password_reset(
            user_id=user.id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires_at,
        )

        if settings.EMAIL_SEND_ENABLED:
            link = build_reset_link(token)
            body = f"Сброс пароля по ссылке: {link}"
            send_email_task.delay(user.email, "Сброс пароля", body)

    async def confirm_password_reset(self, *, token: str, new_password: str) -> None:
        validate_password_policy(new_password)
        token_hash = hash_token(token)
        record = await self.tokens_repo.get_password_reset_by_hash(token_hash)
        if not record:
            raise ValueError("invalid_token")

        now = self._now_utc()
        if record.used_at is not None:
            return
        if record.expires_at < now:
            raise ValueError("invalid_token")

        user = await self.users_repo.get_by_id(record.user_id)
        if not user:
            raise ValueError("invalid_token")

        await self.tokens_repo.mark_password_reset_used(record, now)
        password_hash = hash_password(new_password)
        await self.users_repo.set_password(user, password_hash)
        await self.tokens_repo.revoke_all_refresh_tokens(user.id, now)
