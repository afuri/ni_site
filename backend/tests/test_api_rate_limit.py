from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core import error_codes as codes
from app.models.user import UserRole


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_auth_login_rate_limit(client, create_user, redis_client):
    await create_user(
        login="adminrate",
        email="adminrate@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )

    old_limit = settings.AUTH_LOGIN_RL_LIMIT
    old_window = settings.AUTH_LOGIN_RL_WINDOW_SEC
    settings.AUTH_LOGIN_RL_LIMIT = 1
    settings.AUTH_LOGIN_RL_WINDOW_SEC = 60
    try:
        resp = await client.post("/api/v1/auth/login", json={"login": "adminrate", "password": "AdminPass1"})
        assert resp.status_code == 200

        resp = await client.post("/api/v1/auth/login", json={"login": "adminrate", "password": "AdminPass1"})
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == codes.RATE_LIMITED
    finally:
        settings.AUTH_LOGIN_RL_LIMIT = old_limit
        settings.AUTH_LOGIN_RL_WINDOW_SEC = old_window


@pytest.mark.asyncio
async def test_answers_rate_limit(client, create_user, redis_client):
    await create_user(
        login="adminrl",
        email="adminrl@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentrl",
        email="studentrl@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "adminrl", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "studentrl", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    task_payload = {
        "subject": "math",
        "title": "Task RL",
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
        "title": "Olympiad RL",
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

    old_limit = settings.ANSWERS_RL_LIMIT
    old_window = settings.ANSWERS_RL_WINDOW_SEC
    settings.ANSWERS_RL_LIMIT = 1
    settings.ANSWERS_RL_WINDOW_SEC = 60
    try:
        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={"task_id": task_id, "answer_payload": {"choice_id": "a"}},
            headers=_auth_headers(student_token),
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-RateLimit-Remaining") == "0"

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={"task_id": task_id, "answer_payload": {"choice_id": "a"}},
            headers=_auth_headers(student_token),
        )
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == codes.RATE_LIMITED
    finally:
        settings.ANSWERS_RL_LIMIT = old_limit
        settings.ANSWERS_RL_WINDOW_SEC = old_window


@pytest.mark.asyncio
async def test_global_rate_limit_by_ip(client, redis_client):
    old_limit = settings.GLOBAL_RL_LIMIT
    old_window = settings.GLOBAL_RL_WINDOW_SEC
    settings.GLOBAL_RL_LIMIT = 1
    settings.GLOBAL_RL_WINDOW_SEC = 60
    try:
        resp = await client.get("/api/v1/content")
        assert resp.status_code == 200

        resp = await client.get("/api/v1/content")
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == codes.RATE_LIMITED
    finally:
        settings.GLOBAL_RL_LIMIT = old_limit
        settings.GLOBAL_RL_WINDOW_SEC = old_window


@pytest.mark.asyncio
async def test_critical_per_user_rate_limit(client, create_user, redis_client):
    await create_user(
        login="admincrit",
        email="admincrit@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentcrit",
        email="studentcrit@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    resp = await client.post("/api/v1/auth/login", json={"login": "admincrit", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/login", json={"login": "studentcrit", "password": "StrongPass1"})
    assert resp.status_code == 200
    student_token = resp.json()["access_token"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(student_token))
    assert resp.status_code == 200
    user_id = resp.json()["id"]

    old_limit = settings.CRITICAL_RL_USER_LIMIT
    old_window = settings.CRITICAL_RL_USER_WINDOW_SEC
    old_paths = settings.CRITICAL_RL_PATHS
    settings.CRITICAL_RL_USER_LIMIT = 1
    settings.CRITICAL_RL_USER_WINDOW_SEC = 60
    settings.CRITICAL_RL_PATHS = "/api/v1/admin/users"
    try:
        resp = await client.put(
            f"/api/v1/admin/users/{user_id}",
            json={"city": "Казань"},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200

        resp = await client.put(
            f"/api/v1/admin/users/{user_id}",
            json={"city": "Москва"},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == codes.RATE_LIMITED
    finally:
        settings.CRITICAL_RL_USER_LIMIT = old_limit
        settings.CRITICAL_RL_USER_WINDOW_SEC = old_window
        settings.CRITICAL_RL_PATHS = old_paths
