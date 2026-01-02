from datetime import datetime
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_token import EmailVerification, PasswordResetToken


class AuthTokensRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_email_verification(
        self,
        *,
        user_id: int,
        token_hash: str,
        created_at: datetime,
        expires_at: datetime,
    ) -> EmailVerification:
        obj = EmailVerification(
            user_id=user_id,
            token_hash=token_hash,
            created_at=created_at,
            expires_at=expires_at,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get_email_verification_by_hash(self, token_hash: str) -> EmailVerification | None:
        res = await self.db.execute(
            select(EmailVerification).where(EmailVerification.token_hash == token_hash)
        )
        return res.scalar_one_or_none()

    async def mark_email_verification_used(self, obj: EmailVerification, used_at: datetime) -> EmailVerification:
        obj.used_at = used_at
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete_email_verifications(self, user_id: int) -> None:
        await self.db.execute(
            delete(EmailVerification).where(EmailVerification.user_id == user_id)
        )
        await self.db.commit()

    async def create_password_reset(
        self,
        *,
        user_id: int,
        token_hash: str,
        created_at: datetime,
        expires_at: datetime,
    ) -> PasswordResetToken:
        obj = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            created_at=created_at,
            expires_at=expires_at,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def get_password_reset_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        res = await self.db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        return res.scalar_one_or_none()

    async def mark_password_reset_used(self, obj: PasswordResetToken, used_at: datetime) -> PasswordResetToken:
        obj.used_at = used_at
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete_password_resets(self, user_id: int) -> None:
        await self.db.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id)
        )
        await self.db.commit()
