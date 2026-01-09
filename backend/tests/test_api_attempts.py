from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import UserRole
from app.core import error_codes as codes


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_attempts_flow(client, create_user, redis_client):
    await create_user(
        login="admin02",
        email="admin02@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="student02",
        email="student02@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "admin02", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "student02", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    task_payload = {
        "subject": "math",
        "title": "Task A",
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
        "title": "Olympiad A",
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
        "/api/v1/attempts/start",
        json={"olympiad_id": olympiad_id},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == attempt_id

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
    assert resp.json()["status"] == "submitted"

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"

    resp = await client.get(
        f"/api/v1/attempts/{attempt_id}/result",
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result["percent"] == 100
    assert result["score_total"] == result["score_max"]


@pytest.mark.asyncio
async def test_start_attempt_requires_verified_email(client, create_user):
    await create_user(
        login="admin03",
        email="admin03@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="student03",
        email="student03@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=False,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "admin03", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "student03", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    task_payload = {
        "subject": "math",
        "title": "Task B",
        "content": "3+3?",
        "task_type": "single_choice",
        "payload": {
            "options": [{"id": "a", "text": "6"}, {"id": "b", "text": "7"}],
            "correct_option_id": "a",
        },
    }
    resp = await client.post("/api/v1/admin/tasks", json=task_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    now = datetime.now(timezone.utc)
    olympiad_payload = {
        "title": "Olympiad B",
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
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.EMAIL_NOT_VERIFIED
