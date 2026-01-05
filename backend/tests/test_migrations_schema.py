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
