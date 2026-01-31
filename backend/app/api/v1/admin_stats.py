from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps_auth import require_role
from app.core.deps import get_db
from app.models.attempt import Attempt, AttemptStatus
from app.models.user import UserRole
from app.schemas.admin_stats import ActiveAttemptsStats

router = APIRouter(prefix="/admin/stats", dependencies=[Depends(require_role(UserRole.admin))])


@router.get("/attempts", response_model=ActiveAttemptsStats, tags=["admin"])
async def get_attempts_stats(db: AsyncSession = Depends(get_db)) -> ActiveAttemptsStats:
    now = datetime.now(timezone.utc)

    active_attempts = await db.scalar(
        select(func.count()).select_from(Attempt).where(Attempt.status == AttemptStatus.active)
    )
    active_attempts_open = await db.scalar(
        select(func.count())
        .select_from(Attempt)
        .where(Attempt.status == AttemptStatus.active, Attempt.deadline_at > now)
    )
    active_users_open = await db.scalar(
        select(func.count(func.distinct(Attempt.user_id)))
        .select_from(Attempt)
        .where(Attempt.status == AttemptStatus.active, Attempt.deadline_at > now)
    )

    return ActiveAttemptsStats(
        active_attempts=int(active_attempts or 0),
        active_attempts_open=int(active_attempts_open or 0),
        active_users_open=int(active_users_open or 0),
        updated_at=now,
    )
