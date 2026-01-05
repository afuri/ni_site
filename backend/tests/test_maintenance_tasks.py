import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.auth_token import RefreshToken
from app.models.olympiad import Olympiad, AgeGroup, OlympiadScope
from app.models.audit_log import AuditLog
from app.models.task import Task, Subject, TaskType
from app.models.olympiad_task import OlympiadTask
from app.tasks import maintenance


class FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value


@pytest.mark.asyncio
async def test_cleanup_expired_auth(db_engine):
    session_maker = async_sessionmaker(bind=db_engine, expire_on_commit=False, class_=AsyncSession)
    now = datetime.now(timezone.utc)
    async with session_maker() as session:
        user = User(
            login="tempuser",
            email="temp@example.com",
            password_hash=hash_password("StrongPass1"),
            role=UserRole.student,
            is_active=True,
            is_email_verified=True,
            must_change_password=True,
            temp_password_expires_at=now - timedelta(hours=1),
        )
        session.add(user)
        await session.flush()
        session.add(
            RefreshToken(
                user_id=user.id,
                token_hash="expired",
                created_at=now - timedelta(days=2),
                expires_at=now - timedelta(days=1),
                revoked_at=None,
            )
        )
        session.add(
            RefreshToken(
                user_id=user.id,
                token_hash="revoked",
                created_at=now - timedelta(days=2),
                expires_at=now + timedelta(days=1),
                revoked_at=now - timedelta(hours=2),
            )
        )
        await session.commit()

    result = await maintenance._cleanup_expired_auth(session_maker=session_maker)
    assert result["refresh_deleted"] == 2
    assert result["temp_passwords_cleared"] == 1

    async with session_maker() as session:
        refreshed = await session.get(User, user.id)
        assert refreshed is not None
        assert refreshed.temp_password_expires_at is None
        res = await session.execute(select(RefreshToken))
        assert res.scalars().all() == []


@pytest.mark.asyncio
async def test_cleanup_audit_logs(db_engine):
    session_maker = async_sessionmaker(bind=db_engine, expire_on_commit=False, class_=AsyncSession)
    now = datetime.now(timezone.utc)
    async with session_maker() as session:
        session.add(
            AuditLog(
                user_id=None,
                action="test",
                method="GET",
                path="/",
                status_code=200,
                ip=None,
                user_agent=None,
                request_id="req-1",
                details=None,
                created_at=now - timedelta(days=10),
            )
        )
        session.add(
            AuditLog(
                user_id=None,
                action="test",
                method="GET",
                path="/",
                status_code=200,
                ip=None,
                user_agent=None,
                request_id="req-2",
                details=None,
                created_at=now - timedelta(days=1),
            )
        )
        await session.commit()

    deleted = await maintenance._cleanup_audit_logs(
        session_maker=session_maker,
        retention_days=7,
    )
    assert deleted == 1

    async with session_maker() as session:
        res = await session.execute(select(AuditLog))
        rows = res.scalars().all()
        assert len(rows) == 1
        assert rows[0].request_id == "req-2"


@pytest.mark.asyncio
async def test_warmup_olympiad_cache(db_engine):
    session_maker = async_sessionmaker(bind=db_engine, expire_on_commit=False, class_=AsyncSession)
    now = datetime.now(timezone.utc)
    async with session_maker() as session:
        task = Task(
            subject=Subject.math,
            title="Task",
            content="2+2",
            task_type=TaskType.single_choice,
            payload={"options": [{"id": "a", "text": "4"}], "correct_option_id": "a"},
            created_by_user_id=1,
        )
        olympiad = Olympiad(
            title="Olympiad",
            description="Desc",
            scope=OlympiadScope.global_,
            age_group=AgeGroup.g78,
            attempts_limit=1,
            duration_sec=600,
            available_from=now - timedelta(minutes=1),
            available_to=now + timedelta(minutes=10),
            pass_percent=60,
            is_published=True,
            created_by_user_id=1,
        )
        session.add_all([task, olympiad])
        await session.flush()
        session.add(
            OlympiadTask(
                olympiad_id=olympiad.id,
                task_id=task.id,
                sort_order=1,
                max_score=1,
            )
        )
        await session.commit()

    fake_redis = FakeRedis()

    async def _fake_redis():
        return fake_redis

    count = await maintenance._warmup_olympiad_cache(
        session_maker=session_maker,
        redis_getter=_fake_redis,
    )
    assert count == 1
    assert fake_redis.store
