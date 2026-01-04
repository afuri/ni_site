from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.user import UserRole


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _login(client, login: str, password: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"login": login, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


async def _create_task(client, token: str, title: str = "Task N") -> int:
    task_payload = {
        "subject": "math",
        "title": title,
        "content": "2+2?",
        "task_type": "single_choice",
        "payload": {
            "options": [{"id": "a", "text": "4"}, {"id": "b", "text": "5"}],
            "correct_option_id": "a",
        },
    }
    resp = await client.post("/api/v1/admin/tasks", json=task_payload, headers=_auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_olympiad(client, token: str, *, title: str, available_from: datetime, available_to: datetime) -> int:
    payload = {
        "title": title,
        "description": "Desc",
        "age_group": "7-8",
        "attempts_limit": 1,
        "duration_sec": 600,
        "available_from": available_from.isoformat(),
        "available_to": available_to.isoformat(),
        "pass_percent": 60,
    }
    resp = await client.post("/api/v1/admin/olympiads", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_auth_negative_cases(client, create_user):
    weak_payload = {
        "login": "weakuser",
        "password": "weakpass1",
        "role": "student",
        "email": "weak@example.com",
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 7,
        "subject": None,
    }
    resp = await client.post("/api/v1/auth/register", json=weak_payload)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "weak_password"

    await create_user(
        login="dupuser",
        email="dup@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )
    dup_payload = {
        "login": "dupuser",
        "password": "StrongPass1",
        "role": "student",
        "email": "dup2@example.com",
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 7,
        "subject": None,
    }
    resp = await client.post("/api/v1/auth/register", json=dup_payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "login_taken"

    dup_email_payload = {
        "login": "dupuser2",
        "password": "StrongPass1",
        "role": "student",
        "email": "dup@example.com",
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 7,
        "subject": None,
    }
    resp = await client.post("/api/v1/auth/register", json=dup_email_payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "email_taken"

    resp = await client.post("/api/v1/auth/verify/confirm", json={"token": "bad-token-1"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_token"

    resp = await client.post(
        "/api/v1/auth/password/reset/confirm",
        json={"token": "bad-token-1", "new_password": "StrongPass1"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_token"


@pytest.mark.asyncio
async def test_attempt_start_negative_cases(client, create_user, redis_client):
    await create_user(
        login="adminneg",
        email="adminneg@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentneg",
        email="studentneg@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    admin_token = await _login(client, "adminneg", "AdminPass1")
    student_token = await _login(client, "studentneg", "StrongPass1")

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": 9999},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "olympiad_not_found"

    now = datetime.now(timezone.utc)
    olympiad_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Neg 1",
        available_from=now - timedelta(minutes=1),
        available_to=now + timedelta(hours=1),
    )

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": olympiad_id},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "olympiad_not_published"

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
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "olympiad_has_no_tasks"

    future_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Neg 2",
        available_from=now + timedelta(hours=1),
        available_to=now + timedelta(hours=2),
    )
    resp = await client.post(
        f"/api/v1/admin/olympiads/{future_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": future_id},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "olympiad_not_available"


@pytest.mark.asyncio
async def test_attempt_forbidden_access(client, create_user, redis_client):
    await create_user(
        login="adminforb",
        email="adminforb@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentforb1",
        email="studentforb1@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )
    await create_user(
        login="studentforb2",
        email="studentforb2@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    admin_token = await _login(client, "adminforb", "AdminPass1")
    student1_token = await _login(client, "studentforb1", "StrongPass1")
    student2_token = await _login(client, "studentforb2", "StrongPass1")

    task_id = await _create_task(client, admin_token, title="Task Forbidden")
    now = datetime.now(timezone.utc)
    olympiad_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Forbidden",
        available_from=now - timedelta(minutes=1),
        available_to=now + timedelta(hours=1),
    )
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
        headers=_auth_headers(student1_token),
    )
    assert resp.status_code == 201
    attempt_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/answers",
        json={"task_id": task_id, "answer_payload": {"choice_id": "a"}},
        headers=_auth_headers(student2_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=_auth_headers(student2_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    resp = await client.get(
        f"/api/v1/attempts/{attempt_id}/result",
        headers=_auth_headers(student2_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


@pytest.mark.asyncio
async def test_admin_olympiad_rules_negative(client, create_user):
    await create_user(
        login="adminrules",
        email="adminrules@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    admin_token = await _login(client, "adminrules", "AdminPass1")

    now = datetime.now(timezone.utc)
    invalid_payload = {
        "title": "Olympiad Invalid",
        "description": "Desc",
        "age_group": "7-8",
        "attempts_limit": 1,
        "duration_sec": 600,
        "available_from": now.isoformat(),
        "available_to": now.isoformat(),
        "pass_percent": 60,
    }
    resp = await client.post("/api/v1/admin/olympiads", json=invalid_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_availability"

    olympiad_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Rules",
        available_from=now - timedelta(minutes=1),
        available_to=now + timedelta(hours=1),
    )
    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    update_payload = {"duration_sec": 1200}
    resp = await client.put(
        f"/api/v1/admin/olympiads/{olympiad_id}",
        json=update_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "cannot_change_published_rules"

    task_id = await _create_task(client, admin_token, title="Task Rules")
    add_payload = {"task_id": task_id, "sort_order": 1, "max_score": 1}
    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks",
        json=add_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "cannot_modify_published"


@pytest.mark.asyncio
async def test_content_negative_permissions(client, create_user):
    await create_user(
        login="admincontent",
        email="admincontent@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="teachermod",
        email="teachermod@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        class_grade=None,
        subject="math",
        is_moderator=True,
    )

    admin_token = await _login(client, "admincontent", "AdminPass1")
    mod_token = await _login(client, "teachermod", "TeacherPass1")

    payload = {
        "content_type": "article",
        "title": "Admin Article",
        "body": "A" * 120,
        "image_keys": [],
        "publish": False,
    }
    resp = await client.post("/api/v1/admin/content", json=payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 201
    content_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/content/{content_id}/publish",
        headers=_auth_headers(mod_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    resp = await client.post(
        f"/api/v1/admin/content/{content_id}/unpublish",
        headers=_auth_headers(mod_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    news_payload = {
        "content_type": "news",
        "title": "News",
        "body": "Short",
        "image_keys": ["bad.png"],
        "publish": False,
    }
    resp = await client.post("/api/v1/admin/content", json=news_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


@pytest.mark.asyncio
async def test_uploads_negative_cases(client, create_user):
    await create_user(
        login="adminupload",
        email="adminupload@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    admin_token = await _login(client, "adminupload", "AdminPass1")

    resp = await client.post("/api/v1/uploads/presign", json={"prefix": "tasks", "content_type": "image/png"})
    assert resp.status_code == 401

    resp = await client.post(
        "/api/v1/uploads/presign",
        json={"prefix": "../bad", "content_type": "image/png"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_prefix"

    old_endpoint = settings.STORAGE_ENDPOINT
    old_access = settings.STORAGE_ACCESS_KEY
    old_secret = settings.STORAGE_SECRET_KEY
    try:
        settings.STORAGE_ENDPOINT = "http://localhost:9000"
        settings.STORAGE_ACCESS_KEY = "test"
        settings.STORAGE_SECRET_KEY = "test"

        resp = await client.post(
            "/api/v1/uploads/presign",
            json={"prefix": "tasks", "content_type": "text/plain"},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "content_type_not_allowed"
    finally:
        settings.STORAGE_ENDPOINT = old_endpoint
        settings.STORAGE_ACCESS_KEY = old_access
        settings.STORAGE_SECRET_KEY = old_secret


@pytest.mark.asyncio
async def test_teacher_olympiad_not_found(client, create_user):
    await create_user(
        login="teacherneg",
        email="teacherneg@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        class_grade=None,
        subject="math",
    )
    token = await _login(client, "teacherneg", "TeacherPass1")

    resp = await client.get(
        "/api/v1/teacher/olympiads/999/attempts",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "olympiad_not_found"
