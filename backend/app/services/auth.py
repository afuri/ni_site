from datetime import datetime, timedelta, timezone
import asyncio
from dataclasses import dataclass
import logging
from typing import NoReturn
from sqlalchemy import select, update
from app.models.auth_token import RefreshToken, RefreshRotation, EmailVerification, PasswordResetToken

from app.core.config import settings
from app.core.email import build_reset_link, build_verify_link
from app.core.security import (
    encode_token,
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
from app.core import error_codes as codes
from app.services.school_profile import SchoolProfileService

logger = logging.getLogger(__name__)


def _reject_link(operation: str, code: str, reason: str) -> NoReturn:
    logger.info("auth_link_rejected operation=%s reason=%s", operation, reason)
    raise ValueError(code)


@dataclass(frozen=True)
class TemporaryPasswordReset:
    token: str
    expires_in_seconds: int


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
        region_id: int,
        school_id: int | None,
        school_not_found: bool,
        class_grade: int | None,
        subject: str | None,
        gender: str,
        subscription: int,
    ):
        existing = await self.users_repo.get_by_login(login)
        if existing:
            raise ValueError(codes.LOGIN_TAKEN)

        existing_email = await self.users_repo.get_by_email(email)
        if existing_email:
            raise ValueError(codes.EMAIL_TAKEN)

        try:
            role_enum = UserRole(role)
        except Exception:
            raise ValueError(codes.INVALID_ROLE)

        if role_enum not in (UserRole.student, UserRole.teacher):
            raise ValueError(codes.INVALID_ROLE)

        if role_enum == UserRole.student:
            if class_grade is None:
                raise ValueError(codes.CLASS_GRADE_REQUIRED)
            if subject is not None:
                raise ValueError(codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT)
        if role_enum == UserRole.teacher:
            if subject is None:
                raise ValueError(codes.SUBJECT_REQUIRED)
            if class_grade is not None:
                raise ValueError(codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER)

        try:
            gender_enum = UsersRepo._normalize_gender(gender)
        except Exception:
            raise ValueError(codes.VALIDATION_ERROR)
        validate_password_policy(password)
        choice = await SchoolProfileService(self.users_repo.db).resolve_choice(
            role=role_enum,
            class_grade=class_grade,
            region_id=region_id,
            school_id=school_id,
            school_not_found=school_not_found,
        )
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
            class_grade=class_grade,
            subject=subject,
            gender=gender_enum.value,
            subscription=subscription,
            region_id=choice.region.id,
            school_id=choice.school.id if choice.school else None,
            school_status=choice.status,
            coins=0,
        )
        await self.request_email_verification(email=email)
        return user

    async def login(self, login: str, password: str):
        login_value = login.strip().lower()
        if "@" in login_value:
            user = await self.users_repo.get_by_email(login_value)
        else:
            user = await self.users_repo.get_by_login(login_value)
        if not user or not user.is_active:
            raise ValueError(codes.INVALID_CREDENTIALS)

        if not verify_password(password, user.password_hash):
            raise ValueError(codes.INVALID_CREDENTIALS)

        if user.must_change_password:
            # Serialize exchanges with admin password changes and reset confirmation.
            user = await self.users_repo.get_by_id(user.id, for_update=True, minimal=True)
            if not user or not user.is_active or not user.must_change_password:
                raise ValueError(codes.INVALID_CREDENTIALS)
            if not verify_password(password, user.password_hash):
                raise ValueError(codes.INVALID_CREDENTIALS)
            if user.temp_password_expires_at is None:
                raise ValueError(codes.TEMP_PASSWORD_EXPIRED)
            now = self._now_utc()
            if user.temp_password_expires_at <= now:
                raise ValueError(codes.TEMP_PASSWORD_EXPIRED)
            token = generate_token()
            ttl_seconds = settings.TEMP_PASSWORD_RESET_TTL_MINUTES * 60
            await self.tokens_repo.replace_password_reset(
                user_id=user.id,
                token_hash=hash_token(token),
                created_at=now,
                expires_at=now + timedelta(seconds=ttl_seconds),
            )
            return TemporaryPasswordReset(token=token, expires_in_seconds=ttl_seconds)

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
        return access, refresh, False

    async def refresh_tokens(self, *, refresh_token: str, idempotency_key: str | None = None):
        try:
            payload = decode_token(refresh_token)
            user_id = int(payload['sub'])
        except Exception:
            raise ValueError(codes.INVALID_TOKEN)
        if payload.get('type') != 'refresh':
            raise ValueError(codes.INVALID_TOKEN_TYPE)
        db = self.tokens_repo.db
        user = await self.users_repo.get_by_id(user_id, for_update=True)
        if not user or not user.is_active:
            raise ValueError(codes.INVALID_TOKEN)
        now = self._now_utc()
        if user.must_change_password and (user.temp_password_expires_at is None or user.temp_password_expires_at < now):
            raise ValueError(codes.TEMP_PASSWORD_EXPIRED)
        token_hash = hash_token(refresh_token)
        record = await db.scalar(select(RefreshToken).where(RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash).with_for_update().execution_options(populate_existing=True))
        if not record or record.revoked_at is not None or record.expires_at <= now:
            # Exact operation retry only, never reactivate the revoked token.
            receipt = await db.get(RefreshRotation, token_hash) if idempotency_key else None
            if receipt and receipt.user_id == user_id and receipt.expires_at > now and receipt.request_hash == hash_token(idempotency_key):
                successor = await db.scalar(select(RefreshToken).where(RefreshToken.user_id == user_id,
                    RefreshToken.token_hash == receipt.new_hash, RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now))
                if successor:
                    access, refresh = (encode_token(receipt.claims[k]) for k in ('access','refresh'))
                    if hash_token(refresh) == receipt.new_hash:
                        await db.commit()
                        return access, refresh, user.must_change_password
            raise ValueError(codes.INVALID_TOKEN)
        timestamp = int(now.timestamp())
        claims = {
            'access': {'sub': str(user.id), 'type':'access', 'iat':timestamp,
                'exp':int((now+timedelta(minutes=settings.JWT_ACCESS_TTL_MIN)).timestamp())},
            'refresh': {'sub': str(user.id), 'type':'refresh', 'iat':timestamp,
                'exp':int((now+timedelta(days=settings.JWT_REFRESH_TTL_DAYS)).timestamp()), 'jti':generate_token()},
        }
        access, refresh = (encode_token(claims[k]) for k in ('access','refresh'))
        new_hash = hash_token(refresh)
        record.revoked_at = now
        db.add(RefreshToken(user_id=user.id, token_hash=new_hash, created_at=now,
            expires_at=now+timedelta(days=settings.JWT_REFRESH_TTL_DAYS)))
        if idempotency_key:
            db.add(RefreshRotation(old_hash=token_hash, request_hash=hash_token(idempotency_key), user_id=user.id,
                new_hash=new_hash, claims=claims, expires_at=now+timedelta(seconds=60)))
        await db.commit()
        return access, refresh, user.must_change_password

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
        # Registration returns this same identity-map object; preserve its
        # loaded school/region relationships for the UserRead response.
        user = await self.users_repo.get_by_id(user.id, for_update=True)
        if not user:
            return
        if user.is_email_verified:
            return

        # Resending must not invalidate a letter still in transit. The user lock
        # serializes issuing and consuming links; commit precedes broker access.
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
            body = (
                "Здравствуйте!\n\n"
                "Вы зарегистрировались в Личном кабинете Олимпиады «Невский интеграл».\n"
                f"Ваш логин: {user.login}\n"
                "Для активации аккаунта перейдите по этой ссылке:\n\n"
                f"{link}\n\n"
                "Если вы не регистрировались, проигнорируйте это письмо.\n\n"
                "С уважением,\n"
                "команда проекта «Невский интеграл»"
            )
            send_email_task.delay(user.email, "Подтверждение email", body)

    async def verify_email(self, *, token: str) -> None:
        token_hash = hash_token(token)
        record = await self.tokens_repo.get_email_verification_by_hash(token_hash)
        if not record:
            _reject_link("verify_email", codes.INVALID_TOKEN, "not_found")

        now = self._now_utc()
        if record.expires_at <= now:
            _reject_link("verify_email", codes.TOKEN_EXPIRED, "expired")

        db = self.tokens_repo.db
        user = await self.users_repo.get_by_id(record.user_id, for_update=True, minimal=True)
        record = await db.scalar(select(EmailVerification).where(EmailVerification.token_hash == token_hash)
            .with_for_update().execution_options(populate_existing=True))
        now = self._now_utc()
        if not user or not record:
            _reject_link("verify_email", codes.INVALID_TOKEN, "not_found")
        if record.expires_at <= now:
            _reject_link("verify_email", codes.TOKEN_EXPIRED, "expired")
        if record.used_at is not None and not user.is_email_verified:
            _reject_link("verify_email", codes.INVALID_TOKEN, "verification_revoked")
        if record.used_at is None:
            record.used_at = now
            user.is_email_verified = True
            await db.execute(update(EmailVerification).where(
                EmailVerification.user_id == user.id,
                EmailVerification.used_at.is_(None),
                EmailVerification.expires_at > now,
            ).values(used_at=now))
        await db.commit()

    async def request_password_reset(self, *, email: str) -> None:
        user = await self.users_repo.get_by_email(email)
        if not user:
            raise ValueError(codes.USER_NOT_FOUND)
        user = await self.users_repo.get_by_id(user.id, for_update=True, minimal=True)
        if not user:
            raise ValueError(codes.USER_NOT_FOUND)
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
            body = (
                "Здравствуйте, вы отправили запрос на восстановление пароля "
                f"для пользователя {user.login} на платформе олимпиады "
                "\"Невский интеграл\".\n\n"
                "Для восстановления пароля перейдите по ссылке:\n\n"
                f"{link}\n\n"
                "С уважением,\n"
                "команда проекта \"Невский интеграл\""
            )
            send_email_task.delay(user.email, "Сброс пароля", body)

    async def confirm_password_reset(self, *, token: str, new_password: str) -> None:
        try:
            validate_password_policy(new_password)
        except ValueError:
            _reject_link("reset_password", codes.WEAK_PASSWORD, "weak_password")
        token_hash = hash_token(token)
        record = await self.tokens_repo.get_password_reset_by_hash(token_hash)
        if not record:
            _reject_link("reset_password", codes.INVALID_TOKEN, "not_found")

        now = self._now_utc()
        if record.used_at is not None:
            _reject_link("reset_password", codes.TOKEN_ALREADY_USED, "used")
        if record.expires_at <= now:
            _reject_link("reset_password", codes.TOKEN_EXPIRED, "expired")

        # Password hashing does not hold database row locks.
        password_hash = await asyncio.to_thread(hash_password, new_password)
        db = self.tokens_repo.db
        user = await self.users_repo.get_by_id(record.user_id, for_update=True, minimal=True)
        record = await db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
            .with_for_update().execution_options(populate_existing=True))
        now = self._now_utc()
        if not user or not record:
            _reject_link("reset_password", codes.INVALID_TOKEN, "not_found")
        if record.used_at is not None:
            _reject_link("reset_password", codes.TOKEN_ALREADY_USED, "used")
        if record.expires_at <= now:
            _reject_link("reset_password", codes.TOKEN_EXPIRED, "expired")
        record.used_at = now
        # A successful reset consumes every outstanding link. Two concurrent
        # requests for one account cannot both set a different password.
        await db.execute(update(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        ).values(used_at=now))
        user.password_hash = password_hash
        user.must_change_password = False
        user.temp_password_expires_at = None
        await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
        await db.commit()
