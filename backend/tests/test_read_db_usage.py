import pytest

from app.core.deps import get_db, get_read_db
from app.main import app as fastapi_app


@pytest.mark.asyncio
async def test_content_list_uses_read_db(client, db_session):
    called = {"read": 0, "write": 0}

    async def _read_db():
        called["read"] += 1
        yield db_session

    async def _write_db():
        called["write"] += 1
        raise AssertionError("write DB dependency should not be used for GET /api/v1/content")

    fastapi_app.dependency_overrides[get_read_db] = _read_db
    fastapi_app.dependency_overrides[get_db] = _write_db
    try:
        resp = await client.get("/api/v1/content")
    finally:
        fastapi_app.dependency_overrides.pop(get_read_db, None)
        fastapi_app.dependency_overrides.pop(get_db, None)

    assert resp.status_code == 200
    assert called["read"] > 0
