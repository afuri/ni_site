import pytest

from app.models.user import UserRole


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _login(client, login: str, password: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"login": login, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_admin_and_moderator_content_flow(client, create_user):
    await create_user(
        login="admin01",
        email="admin01@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        is_verified=True,
        class_grade=None,
        subject=None,
    )
    await create_user(
        login="teacher01",
        email="teacher01@example.com",
        password="TeacherPass1",
        role=UserRole.teacher,
        is_verified=True,
        is_moderator=True,
        class_grade=None,
        subject="math",
    )

    admin_token = await _login(client, "admin01", "AdminPass1")
    moderator_token = await _login(client, "teacher01", "TeacherPass1")

    news_payload = {
        "content_type": "news",
        "title": "Новость",
        "body": "Короткая новость",
        "publish": True,
    }
    resp = await client.post("/api/v1/admin/content", json=news_payload, headers=_auth_headers(admin_token))
    assert resp.status_code == 201
    assert resp.json()["status"] == "published"
    assert resp.json()["published_by_id"] is not None

    article_payload = {
        "content_type": "article",
        "title": "Статья",
        "body": "A" * 120,
        "publish": False,
    }
    resp = await client.post("/api/v1/admin/content", json=article_payload, headers=_auth_headers(moderator_token))
    assert resp.status_code == 201
    article_id = resp.json()["id"]
    assert resp.json()["status"] == "draft"

    resp = await client.post(
        f"/api/v1/admin/content/{article_id}/publish",
        headers=_auth_headers(moderator_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"

    resp = await client.post(
        f"/api/v1/admin/content/{article_id}/unpublish",
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"
