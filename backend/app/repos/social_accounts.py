from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.social_account import SocialAccount


class SocialAccountsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_provider_user(self, provider: str, provider_user_id: str) -> SocialAccount | None:
        res = await self.db.execute(
            select(SocialAccount).where(
                SocialAccount.provider == provider,
                SocialAccount.provider_user_id == provider_user_id,
            )
        )
        return res.scalar_one_or_none()

    async def create(self, *, provider: str, provider_user_id: str, user_id: int) -> SocialAccount:
        obj = SocialAccount(provider=provider, provider_user_id=provider_user_id, user_id=user_id)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj
