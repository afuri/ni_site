import pytest

from app.models.user import UserRole


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _login(client, login: str, password: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"login": login, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_student_can_update_manual_teachers(client, create_user):
    await create_user(
        login="studentmanual",
        email="studentmanual@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )
    token = await _login(client, "studentmanual", "StrongPass1")
    payload = {
        "manual_teachers": [{"id": 1, "full_name": "Иванов Иван Иванович", "subject": "Math"}]
    }
    resp = await client.put("/api/v1/users/me", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["manual_teachers"] == payload["manual_teachers"]

    resp = await client.get("/api/v1/users/me", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["manual_teachers"] == payload["manual_teachers"]


@pytest.mark.asyncio
async def test_teacher_cannot_update_manual_teachers(client, create_user):
    await create_user(
        login="teachermanual",
        email="teachermanual@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        class_grade=None,
        subject="Math",
    )
    token = await _login(client, "teachermanual", "TeacherPass1")
    payload = {
        "manual_teachers": [{"id": 9, "full_name": "Иванов Иван Иванович", "subject": "Math"}]
    }
    resp = await client.put("/api/v1/users/me", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["manual_teachers"] == []
