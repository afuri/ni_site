import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core import error_codes as codes
from app.models.attempt import Attempt, AttemptStatus
from app.models.olympiad import Olympiad
from app.models.olympiad_pool import OlympiadAssignment, OlympiadPool, OlympiadPoolItem
from app.models.olympiad_task import OlympiadTask
from app.models.task import Subject, Task, TaskType
from app.models.user import UserRole


async def olympiad(db, *, start=None, end=None, published=True, grade="5-6"):
    now = datetime.now(timezone.utc)
    item = Olympiad(
        title="Олимпиада", age_group=grade, duration_sec=600, attempts_limit=1,
        available_from=start or now - timedelta(hours=1),
        available_to=end or now + timedelta(hours=1), pass_percent=60,
        is_published=published, results_released=False, created_by_user_id=1,
    )
    task = Task(
        subject=Subject.math, title="Задание", content="2+2?",
        task_type=TaskType.short_text, payload={"subtype": "int", "expected": "4"},
        created_by_user_id=1,
    )
    db.add_all([item, task])
    await db.flush()
    db.add(OlympiadTask(olympiad_id=item.id, task_id=task.id, sort_order=1, max_score=1))
    await db.commit()
    return item


async def pool(db, items, *, subject="math", active=True, grade="5-6"):
    item = OlympiadPool(subject=subject, grade_group=grade, is_active=active, created_by_user_id=1)
    db.add(item)
    await db.flush()
    db.add_all([OlympiadPoolItem(pool_id=item.id, olympiad_id=value.id, position=index + 1)
                for index, value in enumerate(items)])
    await db.commit()
    return item


async def student_auth(client, create_user):
    user = await create_user(login="platform01", email="platform01@example.test",
                             password="StrongPass1", role=UserRole.student, class_grade=5)
    response = await client.post("/api/v1/auth/login", json={"login": user.login, "password": "StrongPass1"})
    assert response.status_code == 200
    return user, {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_my_olympiads_preserve_full_pool_modulo_and_saved_assignment(client, create_user, db_session, redis_client):
    user, headers = await student_auth(client, create_user)
    items = [await olympiad(db_session) for _ in range(3)]
    active = await pool(db_session, items)
    expected = items[(user.id - 1) % len(items)]
    # Non-selected unpublished variants must NOT change the modulo denominator.
    for item in items:
        if item.id != expected.id:
            item.is_published = False
    await db_session.commit()
    response = await client.get("/api/v1/olympiads/my", headers=headers)
    assert response.status_code == 200
    assert [value["id"] for value in response.json()] == [expected.id]
    assert await db_session.scalar(select(func.count()).select_from(OlympiadAssignment)) == 0
    assert await db_session.scalar(select(func.count()).select_from(Attempt)) == 0
    replacement = items[(user.id) % len(items)]
    replacement.is_published = True
    db_session.add(OlympiadAssignment(user_id=user.id, pool_id=active.id, olympiad_id=replacement.id))
    await db_session.commit()
    response = await client.get("/api/v1/olympiads/my", headers=headers)
    assert [value["id"] for value in response.json()] == [replacement.id]


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["unpublished", "wrong-grade", "inactive-pool", "past-window", "submitted", "expired", "overdue", "future", "active"])
async def test_my_olympiads_visibility(client, create_user, db_session, redis_client, state):
    user, headers = await student_auth(client, create_user)
    now = datetime.now(timezone.utc)
    item = await olympiad(
        db_session, published=state != "unpublished",
        grade="7-8" if state == "wrong-grade" else "5-6",
        start=now + timedelta(hours=1) if state == "future" else None,
        end=now - timedelta(minutes=1) if state == "past-window" else now + timedelta(hours=2),
    )
    await pool(db_session, [item], active=state != "inactive-pool")
    if state in {"submitted", "expired", "overdue", "active"}:
        db_session.add(Attempt(
            user_id=user.id, olympiad_id=item.id, started_at=now - timedelta(minutes=5),
            deadline_at=now + timedelta(minutes=5) if state == "active" else now - timedelta(seconds=1),
            duration_sec=600, status=AttemptStatus.active if state in {"overdue", "active"} else AttemptStatus(state),
        ))
        await db_session.commit()
    response = await client.get("/api/v1/olympiads/my", headers=headers)
    assert response.status_code == 200
    assert [value["id"] for value in response.json()] == ([item.id] if state in {"future", "active"} else [])


@pytest.mark.asyncio
async def test_my_olympiads_sort_and_auth(client, create_user, db_session, redis_client):
    _, headers = await student_auth(client, create_user)
    now = datetime.now(timezone.utc)
    items = [await olympiad(db_session, start=now + timedelta(minutes=offset)) for offset in (20, 10, 10)]
    for item, subject in zip(items, ("math", "cs", "trial")):
        await pool(db_session, [item], subject=subject)
    response = await client.get("/api/v1/olympiads/my", headers=headers)
    assert [value["id"] for value in response.json()] == [items[1].id, items[2].id, items[0].id]
    assert (await client.get("/api/v1/olympiads/my")).status_code == 401


@pytest.mark.asyncio
async def test_concurrent_starts_only_allow_one_active_and_remain_idempotent(client, create_user, db_session, redis_client):
    user, headers = await student_auth(client, create_user)
    items = [await olympiad(db_session) for _ in range(2)]
    responses = await asyncio.gather(*[
        client.post("/api/v1/attempts/start", headers=headers, json={"olympiad_id": item.id}) for item in items
    ])
    assert sorted(response.status_code for response in responses) == [201, 409]
    blocked = next(response for response in responses if response.status_code == 409)
    assert blocked.json()["error"]["code"] == codes.ACTIVE_ATTEMPT_EXISTS
    active = next(response.json() for response in responses if response.status_code == 201)
    again = await client.post("/api/v1/attempts/start", headers=headers, json={"olympiad_id": active["olympiad_id"]})
    assert again.status_code == 201 and again.json()["id"] == active["id"]
    assert await db_session.scalar(select(func.count()).select_from(Attempt).where(Attempt.user_id == user.id)) == 1
    # An overdue active record is not a permanent blocker for another olympiad.
    record = await db_session.get(Attempt, active["id"])
    record.deadline_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    other = next(item for item in items if item.id != active["olympiad_id"])
    assert (await client.post("/api/v1/attempts/start", headers=headers, json={"olympiad_id": other.id})).status_code == 201
    await db_session.refresh(record)
    assert record.status == AttemptStatus.expired
    assert await db_session.scalar(select(func.count()).select_from(Attempt).where(
        Attempt.user_id == user.id, Attempt.status == AttemptStatus.active,
    )) == 1


@pytest.mark.asyncio
async def test_start_cannot_pick_another_variant_in_active_pool(client, create_user, db_session, redis_client):
    user, headers = await student_auth(client, create_user)
    items = [await olympiad(db_session) for _ in range(2)]
    await pool(db_session, items)
    chosen = items[(user.id - 1) % len(items)]
    other = next(item for item in items if item.id != chosen.id)
    response = await client.post("/api/v1/attempts/start", headers=headers, json={"olympiad_id": other.id})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == codes.OLYMPIAD_NOT_ASSIGNED
    response = await client.post("/api/v1/attempts/start", headers=headers, json={"olympiad_id": chosen.id})
    assert response.status_code == 201
    assignment = await db_session.scalar(select(OlympiadAssignment).where(OlympiadAssignment.user_id == user.id))
    assert assignment.olympiad_id == chosen.id


@pytest.mark.asyncio
@pytest.mark.parametrize("released,status,allowed", [
    (True, AttemptStatus.submitted, True),
    (True, AttemptStatus.expired, True),
    (False, AttemptStatus.submitted, False),
    (True, AttemptStatus.active, False),
])
async def test_archived_images_only_accessible_in_own_released_completed_work(
    client, create_user, db_session, redis_client, monkeypatch, released, status, allowed,
):
    import app.api.v1.uploads as uploads

    user, headers = await student_auth(client, create_user)
    item = await olympiad(db_session, published=False)
    item.results_released = released
    task = await db_session.scalar(select(Task))
    task.image_key = "tasks/archive.png"
    now = datetime.now(timezone.utc)
    db_session.add(Attempt(user_id=user.id, olympiad_id=item.id, status=status,
                           started_at=now, deadline_at=now + timedelta(minutes=10), duration_sec=600))
    await db_session.commit()
    monkeypatch.setattr(uploads, "presign_get", lambda **kwargs: "https://storage.test/archive.png")
    monkeypatch.setattr(uploads, "public_url_for_key", lambda key: None)
    response = await client.get("/api/v1/uploads/tasks/archive.png", headers=headers)
    assert response.status_code == (200 if allowed else 404)
    await create_user(login="stranger01", email="stranger01@example.test", password="StrongPass1", role=UserRole.student)
    login = await client.post("/api/v1/auth/login", json={"login": "stranger01", "password": "StrongPass1"})
    response = await client.get("/api/v1/uploads/tasks/archive.png", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert response.status_code == 404
