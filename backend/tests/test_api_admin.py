from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import UserRole


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

    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_published"] is True

    resp = await client.post(
        f"/api/v1/admin/olympiads/{olympiad_id}/publish",
        params={"publish": "true"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_published"] is True
