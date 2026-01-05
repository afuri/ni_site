from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_change import UserChange


class UserChangesRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        actor_user_id: int | None,
        target_user_id: int,
        action: str,
        details: dict,
        created_at: datetime,
    ) -> UserChange:
        obj = UserChange(
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            action=action,
            details=details,
            created_at=created_at,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj
