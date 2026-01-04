import pytest

from app.core.cache import olympiad_tasks_key
from app.services import tasks as tasks_module
from app.services.tasks import TasksService


class FakeRedis:
    def __init__(self):
        self.deleted_keys = []

    async def delete(self, *keys):
        self.deleted_keys.extend(keys)


class FakeRepo:
    def __init__(self, olympiad_ids):
        self.olympiad_ids = olympiad_ids
        self.deleted = False
        self.updated = False

    async def list_olympiad_ids_for_task(self, task_id: int):
        return self.olympiad_ids

    async def delete(self, task):
        self.deleted = True

    async def update(self, task):
        self.updated = True
        return task


@pytest.mark.asyncio
async def test_task_delete_invalidates_tasks_cache(monkeypatch):
    fake_redis = FakeRedis()

    async def _fake_safe_redis():
        return fake_redis

    monkeypatch.setattr(tasks_module, "safe_redis", _fake_safe_redis)

    repo = FakeRepo([7, 9])
    service = TasksService(repo)

    class TaskObj:
        id = 42

    await service.delete(task=TaskObj())

    assert repo.deleted is True
    assert set(fake_redis.deleted_keys) == {olympiad_tasks_key(7), olympiad_tasks_key(9)}


@pytest.mark.asyncio
async def test_task_update_invalidates_tasks_cache(monkeypatch):
    fake_redis = FakeRedis()

    async def _fake_safe_redis():
        return fake_redis

    monkeypatch.setattr(tasks_module, "safe_redis", _fake_safe_redis)

    repo = FakeRepo([3])
    service = TasksService(repo)

    class TaskObj:
        id = 11
        subject = "math"
        title = "Task"
        content = "Content"
        task_type = "single_choice"
        image_key = None

    await service.update(task=TaskObj(), patch={})

    assert repo.updated is True
    assert fake_redis.deleted_keys == [olympiad_tasks_key(3)]
