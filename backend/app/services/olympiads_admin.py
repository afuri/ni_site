from datetime import datetime, timezone

from app.models.olympiad import Olympiad, OlympiadScope
from app.models.olympiad_task import OlympiadTask
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_tasks import OlympiadTasksRepo
from app.repos.tasks import TasksRepo
from app.core.cache import olympiad_tasks_key, olympiad_meta_key
from app.core.redis import safe_redis


class AdminOlympiadsService:
    def __init__(self, olympiads: OlympiadsRepo, olympiad_tasks: OlympiadTasksRepo, tasks: TasksRepo):
        self.olympiads = olympiads
        self.olympiad_tasks = olympiad_tasks
        self.tasks = tasks

    async def _invalidate_cache(self, olympiad_id: int) -> None:
        redis = await safe_redis()
        if redis is None:
            return
        try:
            await redis.delete(
                olympiad_tasks_key(olympiad_id),
                olympiad_meta_key(olympiad_id),
            )
        except Exception:
            pass

    async def create(self, *, data: dict, admin_id: int) -> Olympiad:
        if data["available_to"] <= data["available_from"]:
            raise ValueError("invalid_availability")

        now = datetime.now(timezone.utc)
        obj = Olympiad(
            title=data["title"],
            description=data.get("description"),
            scope=OlympiadScope.global_,
            age_group=data["age_group"],
            attempts_limit=data["attempts_limit"],
            duration_sec=data["duration_sec"],
            available_from=data["available_from"],
            available_to=data["available_to"],
            pass_percent=data["pass_percent"],
            is_published=False,
            created_by_user_id=admin_id,
            created_at=now,
            updated_at=now,
        )
        return await self.olympiads.create(obj)

    async def update(self, *, olympiad: Olympiad, patch: dict) -> Olympiad:
        # Запрещаем менять критичные поля опубликованной олимпиады (MVP правило)
        if olympiad.is_published and any(k in patch for k in ("duration_sec", "attempts_limit", "available_from", "available_to")):
            raise ValueError("cannot_change_published_rules")

        if "available_from" in patch or "available_to" in patch:
            af = patch.get("available_from", olympiad.available_from)
            at = patch.get("available_to", olympiad.available_to)
            if at <= af:
                raise ValueError("invalid_availability")

        for k, v in patch.items():
            setattr(olympiad, k, v)

        olympiad.updated_at = datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved

    async def add_task(self, *, olympiad: Olympiad, task_id: int, sort_order: int, max_score: int) -> OlympiadTask:
        if olympiad.is_published:
            raise ValueError("cannot_modify_published")

        task = await self.tasks.get(task_id)
        if not task:
            raise ValueError("task_not_found")

        existing = await self.olympiad_tasks.get_by_olympiad_task(olympiad.id, task_id)
        if existing:
            return existing

        obj = OlympiadTask(olympiad_id=olympiad.id, task_id=task_id, sort_order=sort_order, max_score=max_score)
        created = await self.olympiad_tasks.add(obj)
        await self._invalidate_cache(olympiad.id)
        return created

    async def remove_task(self, *, olympiad: Olympiad, task_id: int) -> None:
        if olympiad.is_published:
            raise ValueError("cannot_modify_published")

        existing = await self.olympiad_tasks.get_by_olympiad_task(olympiad.id, task_id)
        if not existing:
            return
        await self.olympiad_tasks.delete(existing)
        await self._invalidate_cache(olympiad.id)

    async def publish(self, *, olympiad: Olympiad, publish: bool) -> Olympiad:
        olympiad.is_published = publish
        olympiad.updated_at = datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved
