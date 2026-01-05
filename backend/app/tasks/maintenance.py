from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete, update, or_, select

from app.core.celery_app import celery_app
from app.core.redis import safe_redis
from app.core import redis as redis_module
from app.models.auth_token import RefreshToken
from app.models.olympiad import Olympiad
from app.models.user import User
from app.db.session import SessionLocal
from app.repos.attempts import AttemptsRepo
from app.services.attempts import AttemptsService


async def _cleanup_expired_auth(
    *,
    session_maker=SessionLocal,
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    async with session_maker() as session:
        res = await session.execute(
            delete(RefreshToken).where(
                or_(
                    RefreshToken.expires_at < now,
                    RefreshToken.revoked_at.is_not(None),
                )
            )
        )
        refresh_deleted = res.rowcount or 0
        res = await session.execute(
            update(User)
            .where(
                User.must_change_password.is_(True),
                User.temp_password_expires_at.is_not(None),
                User.temp_password_expires_at < now,
            )
            .values(temp_password_expires_at=None)
        )
        temp_passwords_cleared = res.rowcount or 0
        await session.commit()
    return {"refresh_deleted": refresh_deleted, "temp_passwords_cleared": temp_passwords_cleared}


async def _warmup_olympiad_cache(
    *,
    session_maker=SessionLocal,
    redis_getter=safe_redis,
) -> int:
    redis = await redis_getter()
    if redis is None:
        return 0
    prev_redis = redis_module.redis_client
    redis_module.redis_client = redis
    now = datetime.now(timezone.utc)
    try:
        async with session_maker() as session:
            res = await session.execute(
                select(Olympiad.id).where(
                    Olympiad.is_published.is_(True),
                    Olympiad.available_from <= now,
                    Olympiad.available_to >= now,
                )
            )
            olympiad_ids = [row[0] for row in res.all()]
            service = AttemptsService(AttemptsRepo(session))
            for olympiad_id in olympiad_ids:
                await service._get_olympiad_cached(olympiad_id)
                await service._get_tasks_cached(olympiad_id)
        return len(olympiad_ids)
    finally:
        redis_module.redis_client = prev_redis


@celery_app.task(name="maintenance.cleanup_expired_auth")
def cleanup_expired_auth() -> dict[str, int]:
    return asyncio.run(_cleanup_expired_auth())


@celery_app.task(name="maintenance.warmup_olympiad_cache")
def warmup_olympiad_cache() -> int:
    return asyncio.run(_warmup_olympiad_cache())
