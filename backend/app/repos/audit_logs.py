from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        user_id: int | None,
        action: str,
        method: str,
        path: str,
        status_code: int,
        ip: str | None,
        user_agent: str | None,
        details: dict | None,
        created_at: datetime,
    ) -> AuditLog:
        obj = AuditLog(
            user_id=user_id,
            action=action,
            method=method,
            path=path,
            status_code=status_code,
            ip=ip,
            user_agent=user_agent,
            details=details,
            created_at=created_at,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj
