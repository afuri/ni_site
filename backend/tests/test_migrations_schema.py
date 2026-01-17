import pytest
from sqlalchemy import inspect


@pytest.mark.asyncio
async def test_audit_logs_has_request_id(db_engine):
    async with db_engine.begin() as conn:
        def _get_columns(sync_conn):
            inspector = inspect(sync_conn)
            return {col["name"] for col in inspector.get_columns("audit_logs")}
        columns = await conn.run_sync(_get_columns)
    assert "request_id" in columns


@pytest.mark.asyncio
async def test_users_has_gender_and_subscription(db_engine):
    async with db_engine.begin() as conn:
        def _get_columns(sync_conn):
            inspector = inspect(sync_conn)
            return inspector.get_columns("users")

        columns = await conn.run_sync(_get_columns)
    names = {col["name"] for col in columns}
    assert {"gender", "subscription"}.issubset(names)
    subscription_col = next(col for col in columns if col["name"] == "subscription")
    assert subscription_col["nullable"] is False


@pytest.mark.asyncio
async def test_users_has_manual_teachers(db_engine):
    async with db_engine.begin() as conn:
        def _get_columns(sync_conn):
            inspector = inspect(sync_conn)
            return inspector.get_columns("users")

        columns = await conn.run_sync(_get_columns)
    names = {col["name"] for col in columns}
    assert "manual_teachers" in names
