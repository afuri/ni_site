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


@pytest.mark.asyncio
async def test_canonical_school_directory_schema(db_engine):
    async with db_engine.begin() as conn:
        def _inspect(sync_conn):
            inspector = inspect(sync_conn)
            return {
                "tables": set(inspector.get_table_names()),
                "users": {column["name"] for column in inspector.get_columns("users")},
                "schools": {column["name"] for column in inspector.get_columns("schools")},
                "submissions": {column["name"] for column in inspector.get_columns("school_submissions")},
                "school_indexes": {index["name"] for index in inspector.get_indexes("schools")},
            }

        schema = await conn.run_sync(_inspect)

    assert {"regions", "cities", "schools", "school_submissions"}.issubset(schema["tables"])
    assert {"region_id", "school_id", "school_status", "coins"}.issubset(schema["users"])
    assert {
        "city_id",
        "full_name",
        "short_name",
        "address",
        "is_sirius",
        "is_consortium",
        "is_peterson",
        "is_partner",
        "is_platform",
        "is_active",
    }.issubset(schema["schools"])
    assert {"user_id", "region_id", "status", "resolved_school_id", "reviewed_by_user_id"}.issubset(
        schema["submissions"]
    )
    assert "ix_school_directory_city_active" in schema["school_indexes"]
