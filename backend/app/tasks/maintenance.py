from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, update, select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.redis import safe_redis
from app.core import redis as redis_module
from app.models.auth_token import RefreshToken, EmailVerification, PasswordResetToken, RefreshRotation
from app.models.audit_log import AuditLog
from app.models.olympiad import Olympiad
from app.models.user import User
from app.db.session import SessionLocal
from app.repos.attempts import AttemptsRepo
from app.services.attempts import AttemptsService


@celery_app.task(name="maintenance.cleanup_deleted_account_files")
def cleanup_deleted_account_files():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.models.account_deletion import AccountDeletionCleanup
    from app.services.account_deletion import cleanup_files

    async def run():
        engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
        try:
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with maker() as db:
                ids = list((await db.scalars(select(AccountDeletionCleanup.user_id).order_by(AccountDeletionCleanup.created_at).limit(100))).all())
            for user_id in ids:
                async with maker() as db:
                    await cleanup_files(db, user_id)
        finally:
            await engine.dispose()
    asyncio.run(run())


async def _cleanup_expired_auth(
    *,
    session_maker=SessionLocal,
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    async with session_maker() as session:
        counts = {}
        for model, terminal in ((RefreshToken, RefreshToken.revoked_at),
            (EmailVerification, EmailVerification.used_at), (PasswordResetToken, PasswordResetToken.used_at)):
            deleted = 0
            # Two indexed bounded searches; no unbounded OR scan.
            for column, condition in ((model.expires_at, model.expires_at <= now), (terminal, terminal.is_not(None))):
                candidates = select(model.id).where(condition).order_by(column, model.id).limit(1000 - deleted).with_for_update(skip_locked=True)
                res = await session.execute(delete(model).where(model.id.in_(candidates)))
                deleted += res.rowcount or 0
            counts[model.__tablename__] = deleted
        candidates = select(RefreshRotation.old_hash).where(RefreshRotation.expires_at <= now).order_by(RefreshRotation.expires_at).limit(1000).with_for_update(skip_locked=True)
        await session.execute(delete(RefreshRotation).where(RefreshRotation.old_hash.in_(candidates)))
        refresh_deleted = counts['refresh_tokens']
        users = select(User.id).where(User.must_change_password.is_(True),
            User.temp_password_expires_at.is_not(None), User.temp_password_expires_at < now
        ).order_by(User.id).limit(1000).with_for_update(of=User, skip_locked=True)
        res = await session.execute(
            update(User)
            .where(User.id.in_(users))
            .values(temp_password_expires_at=None)
        )
        temp_passwords_cleared = res.rowcount or 0
        await session.commit()
    return {"refresh_deleted": refresh_deleted, "email_deleted": counts["email_verifications"],
        "reset_deleted": counts["password_resets"], "temp_passwords_cleared": temp_passwords_cleared}


async def _cleanup_audit_logs(
    *,
    session_maker=SessionLocal,
    retention_days: int,
) -> int:
    if retention_days <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    async with session_maker() as session:
        candidates = select(AuditLog.id).where(AuditLog.created_at < cutoff).order_by(AuditLog.created_at).limit(1000).with_for_update(skip_locked=True)
        res = await session.execute(delete(AuditLog).where(AuditLog.id.in_(candidates)))
        await session.commit()
        return res.rowcount or 0


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
                    Olympiad.archived_at.is_(None),
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


@celery_app.task(name="maintenance.cleanup_expired_auth", soft_time_limit=45, time_limit=50)
def cleanup_expired_auth() -> dict[str, int]:
    return _run_maintenance("cleanup_expired_auth", _cleanup_expired_auth)


@celery_app.task(name="maintenance.cleanup_audit_logs")
def cleanup_audit_logs() -> int:
    return _run_maintenance("cleanup_audit_logs", _cleanup_audit_logs, retention_days=settings.AUDIT_LOG_RETENTION_DAYS)


@celery_app.task(name="maintenance.cleanup_task_uploads")
def cleanup_task_uploads():
    from app.services.task_uploads import cleanup_uploads
    return _run_maintenance("cleanup_task_uploads", cleanup_uploads)


@celery_app.task(name="maintenance.warmup_olympiad_cache")
def warmup_olympiad_cache() -> int:
    return _run_maintenance("warmup_olympiad_cache", _warmup_olympiad_cache)


async def _expire_attempts(*, session_maker=SessionLocal, batch_size: int = 100) -> int:
    """Only active rows; user locks precede attempt locks in every writer."""
    from app.models.attempt import Attempt, AttemptStatus
    closed = 0
    started = time.monotonic()
    async with session_maker() as db:
        now = datetime.now(timezone.utc)
        user_ids = list((await db.scalars(select(User.id).where(select(Attempt.id).where(
            Attempt.user_id == User.id, Attempt.status == AttemptStatus.active,
            Attempt.deadline_at < now).exists()).order_by(User.id)
            .limit(batch_size).with_for_update(of=User, skip_locked=True))).all())
        service = AttemptsService(AttemptsRepo(db))
        for user_id in user_ids:
            if time.monotonic() - started >= 8:
                break
            attempt = await service.repo.get_active_attempt(user_id)
            if attempt and attempt.deadline_at < now:
                await service._finalize_locked(attempt, expired=True)
                closed += 1
        await db.commit()
    return closed


async def _maintenance_backlog(name, session_maker):
    """At most 1001 rows per indexed search, rather than full-table counts."""
    from app.models.attempt import Attempt, AttemptStatus

    now = datetime.now(timezone.utc)
    backlog = {}
    async with session_maker() as db:
        if name == "expire_attempts":
            deadlines = list((await db.scalars(select(Attempt.deadline_at).where(
                Attempt.status == AttemptStatus.active, Attempt.deadline_at < now
            ).order_by(Attempt.deadline_at).limit(1001))).all())
            backlog["attempts"] = {"count_capped": len(deadlines),
                "oldest_due_at": deadlines[0].timestamp() if deadlines else None}
        elif name == "cleanup_expired_auth":
            for model, terminal in ((RefreshToken, RefreshToken.revoked_at),
                (EmailVerification, EmailVerification.used_at), (PasswordResetToken, PasswordResetToken.used_at)):
                pending = {}
                for column, condition in ((model.expires_at, model.expires_at <= now), (terminal, terminal.is_not(None))):
                    rows = (await db.execute(select(model.id, column).where(condition)
                        .order_by(column, model.id).limit(1001))).all()
                    for row_id, due_at in rows:
                        pending[row_id] = min(pending.get(row_id, due_at), due_at)
                backlog[model.__tablename__] = {"count_capped": min(len(pending), 1001),
                    "oldest_due_at": min(pending.values()).timestamp() if pending else None}
    return backlog


def _run_maintenance(name, action, **kwargs):
    # Celery invokes a fresh event loop on every task. Never reuse async pooled
    # connections or Redis connections attached to a previous loop.
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from redis.asyncio import Redis
    import json

    async def run():
        engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool,
            connect_args={"server_settings": {"statement_timeout": "15000", "lock_timeout": "5000"}})
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT_SEC,
            socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT_SEC)
        previous = redis_module.redis_client
        redis_module.redis_client = redis
        try:
            maker = async_sessionmaker(engine, expire_on_commit=False)
            result = await action(session_maker=maker, **kwargs)
            try:
                backlog = await _maintenance_backlog(name, maker)
            except Exception:
                backlog = {}  # Monitoring must not fail an already committed task.
            # Published only after successful database commits, outside row locks.
            try:
                await redis.set(f"maintenance:last:{name}", json.dumps({
                    "completed_at": datetime.now(timezone.utc).timestamp(), "result": result, "backlog": backlog}))
            except Exception:
                pass  # Monitoring availability must not undo successful work.
            return result
        finally:
            redis_module.redis_client = previous
            await redis.aclose()
            await engine.dispose()
    return asyncio.run(run())


@celery_app.task(name="maintenance.expire_attempts", soft_time_limit=20, time_limit=25)
def expire_attempts() -> int:
    return _run_maintenance("expire_attempts", _expire_attempts)
