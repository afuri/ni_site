from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import UserRole
from app.core import error_codes as codes


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_task_and_olympiad_idempotency(client, create_user):
    await create_user(
        login="admin01",
        email="admin01@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "admin01", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    task_payload = {
        "subject": "math",
        "title": "Task 1",
        "content": "2+2?",
        "task_type": "single_choice",
        "payload": {
            "options": [{"id": "a", "text": "4"}, {"id": "b", "text": "5"}],
            "correct_option_id": "a",
        },
    }
    resp = await client.post("/api/v1/admin/tasks", json=task_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    now = datetime.now(timezone.utc)
    olympiad_payload = {
        "title": "Olympiad 1",
        "description": "Desc",
        "age_group": "7-8",
        "attempts_limit": 1,
        "duration_sec": 600,
        "available_from": (now - timedelta(minutes=1)).isoformat(),
        "available_to": (now + timedelta(hours=1)).isoformat(),
        "pass_percent": 60,
    }
    resp = await client.post("/api/v1/admin/olympiads", json=olympiad_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 201
    olympiad_id = resp.json()["id"]

    add_payload = {"task_id": task_id, "sort_order": 1, "max_score": 1}
    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks",
        json=add_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 201
    first_link_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks",
        json=add_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == first_link_id

    resp = await client.delete(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks/{task_id}",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 204

    resp = await client.delete(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks/{task_id}",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 204



@pytest.mark.asyncio
async def test_admin_update_user_and_temp_password_flow(client, create_user):
    await create_user(
        login="adminuser",
        email="adminuser@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studenttemp",
        email="studenttemp@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "adminuser", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "studenttemp", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(student_token))
    assert resp.status_code == 200
    user_id = resp.json()["id"]

    update_payload = {"login": "studenttemp2", "city": "Казань"}
    resp = await client.put(
        f"/api/v1/admin/users/{user_id}",
        json=update_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["login"] == "studenttemp2"
    assert resp.json()["email"] == "studenttemp@example.com"
    assert resp.json()["city"] == "Казань"

    temp_payload = {"temp_password": "TempPass1"}
    resp = await client.post(
        f"/api/v1/admin/users/{user_id}/temp-password",
        json=temp_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True

    resp = await client.post("/api/v1/auth/login", json={"login": "studenttemp2", "password": "StrongPass1"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == codes.INVALID_CREDENTIALS

    resp = await client.post("/api/v1/auth/login", json={"login": "studenttemp2", "password": "TempPass1"})
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True
    temp_token = resp.json()["access_token"]

    resp = await client.get("/api/v1/users/me", headers=_auth_headers(temp_token))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED

    resp = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "WrongPass1", "new_password": "NewPass123"},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.INVALID_CURRENT_PASSWORD

    resp = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "TempPass1", "new_password": "weakpass1"},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.WEAK_PASSWORD

    resp = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "TempPass1", "new_password": "NewPass123"},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 200

    resp = await client.get("/api/v1/users/me", headers=_auth_headers(temp_token))
    assert resp.status_code == 200

    resp = await client.post("/api/v1/auth/login", json={"login": "studenttemp2", "password": "NewPass123"})
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is False


@pytest.mark.asyncio
async def test_admin_generate_temp_password_flow(client, create_user):
    await create_user(
        login="admingenerate",
        email="admingenerate@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentgen",
        email="studentgen@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "admingenerate", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "studentgen", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(student_token))
    assert resp.status_code == 200
    user_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{user_id}/temp-password/generate",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    temp_password = resp.json()["temp_password"]
    assert isinstance(temp_password, str)
    assert len(temp_password) >= 8

    resp = await client.post("/api/v1/auth/login", json={"login": "studentgen", "password": temp_password})
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True
