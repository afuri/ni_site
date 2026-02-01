from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps_auth import require_role
from app.core.deps import get_db
from app.models.attempt import Attempt, AttemptStatus
from app.models.user import UserRole
from app.schemas.admin_stats import ActiveAttemptsSeries, ActiveAttemptsSeriesPoint, ActiveAttemptsStats

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


@router.get("/attempts/timeseries", response_model=ActiveAttemptsSeries, tags=["admin"])
async def get_attempts_timeseries(
    db: AsyncSession = Depends(get_db),
) -> ActiveAttemptsSeries:
    step_minutes = 10
    moscow_tz = ZoneInfo("Europe/Moscow")
    now_msk = datetime.now(moscow_tz)
    rounded_minute = (now_msk.minute // step_minutes) * step_minutes
    now_msk = now_msk.replace(minute=rounded_minute, second=0, microsecond=0)
    now = now_msk.astimezone(timezone.utc)
    end_time = now
    start_time = now_msk.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    stmt = text(
        """
        SELECT
            t.bucket AS bucket,
            COALESCE(count(a.id), 0) AS active_attempts,
            COALESCE(count(distinct a.user_id), 0) AS active_users
        FROM generate_series(:start_time, :end_time, :step::interval) AS t(bucket)
        LEFT JOIN attempts a
            ON a.status = :status
            AND a.started_at <= t.bucket
            AND a.deadline_at > t.bucket
        GROUP BY t.bucket
        ORDER BY t.bucket
        """
    )

    rows = await db.execute(
        stmt,
        {
            "start_time": start_time,
            "end_time": end_time,
            "step": f"{step_minutes} minutes",
            "status": AttemptStatus.active.value,
        },
    )

    points = [
        ActiveAttemptsSeriesPoint(
            bucket=row.bucket,
            active_attempts=int(row.active_attempts or 0),
            active_users=int(row.active_users or 0),
        )
        for row in rows
    ]

    return ActiveAttemptsSeries(step_minutes=step_minutes, points=points)
