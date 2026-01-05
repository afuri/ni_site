from datetime import datetime
from sqlalchemy import select
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
        request_id: str | None,
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
            request_id=request_id,
            details=details,
            created_at=created_at,
        )
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def list(
        self,
        *,
        user_id: int | None,
        action: str | None,
        status_code: int | None,
        from_dt: datetime | None,
        to_dt: datetime | None,
        limit: int,
        offset: int,
    ) -> list[AuditLog]:
        stmt = select(AuditLog)

        if user_id is not None:
            stmt = stmt.where(AuditLog.user_id == user_id)
        if action is not None:
            stmt = stmt.where(AuditLog.action == action)
        if status_code is not None:
            stmt = stmt.where(AuditLog.status_code == status_code)
        if from_dt is not None:
            stmt = stmt.where(AuditLog.created_at >= from_dt)
        if to_dt is not None:
            stmt = stmt.where(AuditLog.created_at <= to_dt)

        stmt = stmt.order_by(AuditLog.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
