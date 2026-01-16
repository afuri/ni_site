from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import UserRole
from app.repos.users import UsersRepo


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_e2e_register_attempt_result(client, db_session, create_user):
    await create_user(
        login="adminE2E",
        email="admin_e2e@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )

    payload = {
        "login": "studentE2E",
        "password": "StrongPass1",
        "role": "student",
        "email": "student_e2e@example.com",
        "gender": "male",
        "subscription": 0,
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 7,
        "subject": None,
    }
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201

    repo = UsersRepo(db_session)
    user = await repo.get_by_login("studentE2E")
    assert user is not None
    await repo.set_email_verified(user)

    resp = await client.post("/api/v1/auth/login", json={"login": "studentE2E", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "adminE2E", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    task_payload = {
        "subject": "math",
        "title": "Task E2E",
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
        "title": "Olympiad E2E",
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

    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": olympiad_id},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 201
    attempt_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={"task_id": task_id, "answer_payload": {"choice_id": "a"}},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 200

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 200

    resp = await client.get(
        f"/api/v1/attempts/{attempt_id}/result",
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 200
    assert resp.json()["attempt_id"] == attempt_id
