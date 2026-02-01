from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps_auth import require_role
from app.core.deps import get_db
from app.models.attempt import Attempt, AttemptStatus
from app.models.user import UserRole
from app.schemas.admin_stats import StartedAttemptsSeries, StartedAttemptsSeriesPoint, ActiveAttemptsStats

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


@router.get("/attempts/completions", response_model=StartedAttemptsSeries, tags=["admin"])
async def get_attempts_timeseries(
    db: AsyncSession = Depends(get_db),
) -> StartedAttemptsSeries:
    step_minutes = 30
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
            COALESCE(count(a.id), 0) AS started_attempts
        FROM generate_series(:start_time, :end_time, CAST(:step AS interval)) AS t(bucket)
        LEFT JOIN attempts a
            ON a.started_at >= t.bucket
            AND a.started_at < t.bucket + CAST(:step AS interval)
        GROUP BY t.bucket
        ORDER BY t.bucket
        """
    )

    rows = await db.execute(
        stmt,
        {
            "start_time": start_time,
            "end_time": end_time,
            "step": timedelta(minutes=step_minutes),
        },
    )

    points = [
        StartedAttemptsSeriesPoint(
            bucket=row.bucket,
            started_attempts=int(row.started_attempts or 0),
        )
        for row in rows
    ]

    return StartedAttemptsSeries(step_minutes=step_minutes, points=points)
