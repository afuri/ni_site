from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core import error_codes as codes
from app.models.user import UserRole
from app.repos.users import UsersRepo


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
        "gender": "female",
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
    resp = await client.post("/api/v1/auth/register", json=weak_payload)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.WEAK_PASSWORD

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
    resp = await client.post("/api/v1/auth/register", json=dup_payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.LOGIN_TAKEN

    dup_email_payload = {
        "login": "dupuser2",
        "password": "StrongPass1",
        "role": "student",
        "email": "dup@example.com",
        "gender": "female",
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
    resp = await client.post("/api/v1/auth/register", json=dup_email_payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.EMAIL_TAKEN

    resp = await client.post("/api/v1/auth/verify/confirm", json={"token": "bad-token-1"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.INVALID_TOKEN

    resp = await client.post(
        "/api/v1/auth/password/reset/confirm",
        json={"token": "bad-token-1", "new_password": "StrongPass1"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.INVALID_TOKEN


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
    await create_user(
        login="studentneg9",
        email="studentneg9@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=9,
        subject=None,
    )

    admin_token = await _login(client, "adminneg", "AdminPass1")
    student_token = await _login(client, "studentneg", "StrongPass1")
    student9_token = await _login(client, "studentneg9", "StrongPass1")

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": 9999},
        headers=_auth_headers(student_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_FOUND

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
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_PUBLISHED

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
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_HAS_NO_TASKS

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
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_AVAILABLE

    task_id = await _create_task(client, admin_token, title="Task Age Group")
    age_group_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Age Group",
        available_from=now - timedelta(minutes=1),
        available_to=now + timedelta(hours=1),
    )
    add_payload = {"task_id": task_id, "sort_order": 1, "max_score": 1}
    resp = await client.post(
        f"/api/v1/admin/olympiads/{age_group_id}/tasks",
        json=add_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 201
    resp = await client.post(
        f"/api/v1/admin/olympiads/{age_group_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": age_group_id},
        headers=_auth_headers(student9_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_AGE_GROUP_MISMATCH


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
    assert resp.json()["error"]["code"] == codes.FORBIDDEN

    resp = await client.post(
        f"/api/v1/attempts/{attempt_id}/submit",
        headers=_auth_headers(student2_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.FORBIDDEN

    resp = await client.get(
        f"/api/v1/attempts/{attempt_id}/result",
        headers=_auth_headers(student2_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.FORBIDDEN


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
    assert resp.json()["error"]["code"] == codes.INVALID_AVAILABILITY

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
    assert resp.json()["error"]["code"] == codes.CANNOT_CHANGE_PUBLISHED_RULES

    task_id = await _create_task(client, admin_token, title="Task Rules")
    add_payload = {"task_id": task_id, "sort_order": 1, "max_score": 1}
    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/tasks",
        json=add_payload,
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.CANNOT_MODIFY_PUBLISHED


@pytest.mark.asyncio
async def test_admin_olympiad_delete_negative(client, create_user):
    await create_user(
        login="admindel",
        email="admindel@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="teacherdel",
        email="teacherdel@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        class_grade=None,
        subject="math",
    )

    admin_token = await _login(client, "admindel", "AdminPass1")
    teacher_token = await _login(client, "teacherdel", "TeacherPass1")

    resp = await client.delete(
        "/api/v1/admin/olympiads/9999",
        headers=_auth_headers(teacher_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.FORBIDDEN

    resp = await client.delete(
        "/api/v1/admin/olympiads/9999",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_FOUND

    now = datetime.now(timezone.utc)
    olympiad_id = await _create_olympiad(
        client,
        admin_token,
        title="Olympiad Delete",
        available_from=now - timedelta(minutes=1),
        available_to=now + timedelta(hours=1),
    )

    resp = await client.delete(
        f"/api/v1/admin/olympiads/{olympiad_id}",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 204

    resp = await client.delete(
        f"/api/v1/admin/olympiads/{olympiad_id}",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_FOUND


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
    assert resp.json()["error"]["code"] == codes.FORBIDDEN

    resp = await client.post(
        f"/api/v1/admin/content/{content_id}/unpublish",
        headers=_auth_headers(mod_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.FORBIDDEN

    news_payload = {
        "content_type": "news",
        "title": "News",
        "body": "Short",
        "image_keys": ["bad.png"],
        "publish": False,
    }
    resp = await client.post("/api/v1/admin/content", json=news_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.VALIDATION_ERROR


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
    assert resp.json()["error"]["code"] == codes.INVALID_PREFIX

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
        assert resp.json()["error"]["code"] == codes.CONTENT_TYPE_NOT_ALLOWED
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
    assert resp.json()["error"]["code"] == codes.OLYMPIAD_NOT_FOUND


@pytest.mark.asyncio
async def test_admin_users_negative_cases(client, create_user):
    await create_user(
        login="adminusersneg",
        email="adminusersneg@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentusersneg",
        email="studentusersneg@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )
    await create_user(
        login="teacherusersneg",
        email="teacherusersneg@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        class_grade=None,
        subject="math",
    )

    admin_token = await _login(client, "adminusersneg", "AdminPass1")
    student_token = await _login(client, "studentusersneg", "StrongPass1")
    teacher_token = await _login(client, "teacherusersneg", "TeacherPass1")

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(student_token))
    assert resp.status_code == 200
    student_id = resp.json()["id"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(teacher_token))
    assert resp.status_code == 200
    teacher_id = resp.json()["id"]

    resp = await client.put(
        "/api/v1/admin/users/9999",
        json={"school": "Test School"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == codes.USER_NOT_FOUND

    resp = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={"subject": "math"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT

    resp = await client.put(
        f"/api/v1/admin/users/{teacher_id}",
        json={"class_grade": 7},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER

    resp = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={"is_moderator": True},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.USER_NOT_TEACHER

    resp = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={"login": "teacherusersneg"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.LOGIN_TAKEN

    resp = await client.post(
        f"/api/v1/admin/users/{student_id}/temp-password",
        json={"temp_password": "weakpass1"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.WEAK_PASSWORD

    resp = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={"email": "new@example.com"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.VALIDATION_ERROR


@pytest.mark.asyncio
async def test_admin_update_requires_otp_for_admin_target(client, create_user, redis_client):
    await create_user(
        login="adminotp1",
        email="adminotp1@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="adminotp2",
        email="adminotp2@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )

    admin_token = await _login(client, "adminotp1", "AdminPass1")
    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    admin_id = resp.json()["id"]

    resp = await client.put(
        f"/api/v1/admin/users/{admin_id}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.ADMIN_OTP_REQUIRED


@pytest.mark.asyncio
async def test_refresh_and_endpoint_blocking_on_must_change_password(client, create_user):
    await create_user(
        login="adminforce",
        email="adminforce@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentforce",
        email="studentforce@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    admin_token = await _login(client, "adminforce", "AdminPass1")
    resp = await client.post("/api/v1/auth/login", json={"login": "studentforce", "password": "StrongPass1"})
    assert resp.status_code == 200
    refresh_token = resp.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is False

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(resp.json()["access_token"]))
    assert resp.status_code == 200
    student_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{student_id}/temp-password",
        json={"temp_password": "TempPass1"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.INVALID_TOKEN

    resp = await client.post("/api/v1/auth/login", json={"login": "studentforce", "password": "TempPass1"})
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True
    temp_token = resp.json()["access_token"]
    temp_refresh = resp.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": temp_refresh},
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True

    resp = await client.get("/api/v1/users/me", headers=_auth_headers(temp_token))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": 9999},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED

    resp = await client.post(
        "/api/v1/admin/content",
        json={"content_type": "article", "title": "Blocked", "body": "A" * 120, "publish": False},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED


@pytest.mark.asyncio
async def test_admin_blocked_when_password_change_required(client, create_user):
    await create_user(
        login="adminlock",
        email="adminlock@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="adminlock2",
        email="adminlock2@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )

    admin_token = await _login(client, "adminlock", "AdminPass1")
    resp = await client.post("/api/v1/auth/login", json={"login": "adminlock2", "password": "AdminPass1"})
    assert resp.status_code == 200
    admin2_refresh = resp.json()["refresh_token"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(resp.json()["access_token"]))
    assert resp.status_code == 200
    admin2_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{admin2_id}/temp-password",
        json={"temp_password": "TempPass1"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": admin2_refresh},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.INVALID_TOKEN

    resp = await client.post("/api/v1/auth/login", json={"login": "adminlock2", "password": "TempPass1"})
    assert resp.status_code == 200
    temp_token = resp.json()["access_token"]

    resp = await client.get("/api/v1/admin/tasks", headers=_auth_headers(temp_token))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED

    resp = await client.post(
        "/api/v1/admin/content",
        json={"content_type": "article", "title": "Blocked", "body": "A" * 120, "publish": False},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED

    resp = await client.post(
        "/api/v1/attempts/start",
        json={"olympiad_id": 9999},
        headers=_auth_headers(temp_token),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == codes.PASSWORD_CHANGE_REQUIRED


@pytest.mark.asyncio
async def test_admin_update_revokes_refresh_tokens(client, create_user):
    await create_user(
        login="adminrevoke",
        email="adminrevoke@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentrevoke",
        email="studentrevoke@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    admin_token = await _login(client, "adminrevoke", "AdminPass1")
    resp = await client.post("/api/v1/auth/login", json={"login": "studentrevoke", "password": "StrongPass1"})
    assert resp.status_code == 200
    refresh_token = resp.json()["refresh_token"]

    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(resp.json()["access_token"]))
    assert resp.status_code == 200
    student_id = resp.json()["id"]

    resp = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == codes.INVALID_TOKEN


@pytest.mark.asyncio
async def test_temp_password_expired_blocks_login_and_refresh(client, create_user, db_session):
    await create_user(
        login="adminexpire",
        email="adminexpire@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="studentexpire",
        email="studentexpire@example.com",
        password="StrongPass1",
        role=UserRole.student,
        is_verified=True,
        class_grade=7,
        subject=None,
    )

    admin_token = await _login(client, "adminexpire", "AdminPass1")
    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(admin_token))
    assert resp.status_code == 200

    resp = await client.post("/api/v1/auth/login", json={"login": "studentexpire", "password": "StrongPass1"})
    assert resp.status_code == 200
    resp = await client.get("/api/v1/auth/me", headers=_auth_headers(resp.json()["access_token"]))
    assert resp.status_code == 200
    student_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{student_id}/temp-password",
        json={"temp_password": "TempPass1"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    resp = await client.post("/api/v1/auth/login", json={"login": "studentexpire", "password": "TempPass1"})
    assert resp.status_code == 200
    refresh_token = resp.json()["refresh_token"]

    repo = UsersRepo(db_session)
    user = await repo.get_by_id(student_id)
    user.temp_password_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db_session.commit()

    resp = await client.post("/api/v1/auth/login", json={"login": "studentexpire", "password": "TempPass1"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.TEMP_PASSWORD_EXPIRED

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == codes.TEMP_PASSWORD_EXPIRED


@pytest.mark.asyncio
async def test_admin_update_other_admin_requires_super_admin(client, create_user):
    old_super = settings.SUPER_ADMIN_LOGINS
    settings.SUPER_ADMIN_LOGINS = "superadmin"
    try:
        await create_user(
            login="superadmin",
            email="superadmin@example.com",
            password="AdminPass1",
            role=UserRole.admin,
            is_verified=True,
            class_grade=None,
            subject=None,
        )
        await create_user(
            login="adminplain",
            email="adminplain@example.com",
            password="AdminPass1",
            role=UserRole.admin,
            is_verified=True,
            class_grade=None,
            subject=None,
        )
        await create_user(
            login="adminother",
            email="adminother@example.com",
            password="AdminPass1",
            role=UserRole.admin,
            is_verified=True,
            class_grade=None,
            subject=None,
        )

        super_token = await _login(client, "superadmin", "AdminPass1")
        admin_token = await _login(client, "adminplain", "AdminPass1")
        other_token = await _login(client, "adminother", "AdminPass1")

        resp = await client.get("/api/v1/auth/me", headers=_auth_headers(other_token))
        assert resp.status_code == 200
        other_id = resp.json()["id"]

        resp = await client.put(
            f"/api/v1/admin/users/{other_id}",
            json={"is_active": False},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == codes.FORBIDDEN

        resp = await client.put(
            f"/api/v1/admin/users/{other_id}",
            json={"is_active": False},
            headers=_auth_headers(super_token),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == codes.ADMIN_OTP_REQUIRED

        resp = await client.post(
            "/api/v1/admin/users/otp",
            headers=_auth_headers(super_token),
        )
        assert resp.status_code == 200
        otp = resp.json()["otp"]

        resp = await client.put(
            f"/api/v1/admin/users/{other_id}",
            json={"is_active": False, "admin_otp": "000000"},
            headers=_auth_headers(super_token),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == codes.ADMIN_OTP_INVALID

        resp = await client.put(
            f"/api/v1/admin/users/{other_id}",
            json={"is_active": False, "admin_otp": otp},
            headers=_auth_headers(super_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
    finally:
        settings.SUPER_ADMIN_LOGINS = old_super
