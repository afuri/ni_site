import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from redis.asyncio import Redis

from app.core.config import settings
from app.core.deps import get_db
from app.core.security import hash_password
from app.db.base import Base
from app.main import app
from app.models.user import UserRole
from app.repos.users import UsersRepo
from app.core import redis as redis_module

import app.models.user  # noqa: F401
import app.models.task  # noqa: F401
import app.models.olympiad  # noqa: F401
import app.models.olympiad_task  # noqa: F401
import app.models.attempt  # noqa: F401
import app.models.teacher_student  # noqa: F401
import app.models.social_account  # noqa: F401
import app.models.auth_token  # noqa: F401
import app.models.audit_log  # noqa: F401


def _get_test_db_url() -> str:
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    return url


def _get_test_redis_url() -> str:
    url = os.getenv("TEST_REDIS_URL")
    if not url:
        pytest.skip("TEST_REDIS_URL is not set")
    return url


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(_get_test_db_url(), pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def truncate_tables(request):
    if "db_engine" not in request.fixturenames:
        yield
        return

    db_engine = request.getfixturevalue("db_engine")
    async with db_engine.begin() as conn:
        table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
        if table_names:
            await conn.execute(text(f"TRUNCATE {', '.join(table_names)} RESTART IDENTITY CASCADE"))
    yield


@pytest_asyncio.fixture
async def db_session(db_engine):
    session_maker = async_sessionmaker(bind=db_engine, expire_on_commit=False, class_=AsyncSession)
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    async def _get_test_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def redis_client():
    url = _get_test_redis_url()
    settings.REDIS_URL = url
    redis_module.redis_client = None

    client = Redis.from_url(url, decode_responses=True)
    try:
        await client.ping()
    except Exception:
        pytest.skip("Redis is not available")

    await client.flushdb()
    yield client
    await client.flushdb()
    await client.close()


@pytest_asyncio.fixture
async def create_user(db_session):
    async def _create(
        *,
        login: str,
        email: str,
        password: str,
        role: UserRole,
        is_verified: bool = True,
        subject: str | None = None,
        class_grade: int | None = 5,
    ):
        repo = UsersRepo(db_session)
        return await repo.create(
            login=login,
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_email_verified=is_verified,
            surname="Иванов",
            name="Иван",
            father_name="Иванович",
            country="Россия",
            city="Москва",
            school="Школа",
            class_grade=class_grade,
            subject=subject,
        )

    return _create
