import pytest

from app.core import error_codes as codes
from app.repos.users import UsersRepo


@pytest.mark.asyncio
async def test_register_and_login_flow(client, db_session):
    payload = {
        "login": "student01",
        "password": "StrongPass1",
        "role": "student",
        "email": "student01@example.com",
        "gender": "male",
        "subscription": 0,
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 7,
        "subject": "Math",
    }
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["login"] == "student01"
    assert data["role"] == "student"
    assert data["gender"] == "male"
    assert data["subscription"] == 0

    resp = await client.post("/api/v1/auth/login", json={"login": "student01", "password": "StrongPass1"})
    assert resp.status_code == 200
    tokens = resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens


@pytest.mark.asyncio
async def test_auth_validation_error_format(client):
    resp = await client.post("/api/v1/auth/register", json={})
    assert resp.status_code == 422
    payload = resp.json()["error"]
    assert payload["code"] == codes.VALIDATION_ERROR
    assert isinstance(payload["details"], list)


@pytest.mark.asyncio
async def test_invalid_credentials_code(client):
    resp = await client.post("/api/v1/auth/login", json={"login": "missing", "password": "bad"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == codes.INVALID_CREDENTIALS
