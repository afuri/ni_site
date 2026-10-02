from datetime import datetime, timezone
from sqlalchemy import select, or_
from app.models.attempt import Attempt
from app.models.olympiad_pool import OlympiadAssignment
from app.schemas.tasks import TaskCreate

from app.models.olympiad import Olympiad, OlympiadScope
from app.models.olympiad_task import OlympiadTask
from app.repos.olympiads import OlympiadsRepo
from app.repos.olympiad_tasks import OlympiadTasksRepo
from app.repos.tasks import TasksRepo
from app.core.cache import olympiad_tasks_key, olympiad_meta_key
from app.core.redis import safe_redis
from app.core import error_codes as codes


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
            raise ValueError(codes.INVALID_AVAILABILITY)

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

    async def _lock(self, olympiad: Olympiad) -> Olympiad:
        row = await self.olympiads.db.execute(select(Olympiad).where(Olympiad.id == olympiad.id).with_for_update().execution_options(populate_existing=True))
        return row.scalar_one()

    async def _ensure_editable(self, olympiad: Olympiad) -> None:
        used = await self.olympiads.db.scalar(select(or_(
            select(Attempt.id).where(Attempt.olympiad_id == olympiad.id).exists(),
            select(OlympiadAssignment.id).where(OlympiadAssignment.olympiad_id == olympiad.id).exists(),
        )))
        if olympiad.archived_at or olympiad.rules_locked_at or olympiad.is_published or used:
            raise ValueError(codes.CANNOT_CHANGE_PUBLISHED_RULES)

    async def update(self, *, olympiad: Olympiad, patch: dict) -> Olympiad:
        olympiad = await self._lock(olympiad)
        await self._ensure_editable(olympiad)

        if "available_from" in patch or "available_to" in patch:
            af = patch.get("available_from", olympiad.available_from)
            at = patch.get("available_to", olympiad.available_to)
            if at <= af:
                raise ValueError(codes.INVALID_AVAILABILITY)

        for k, v in patch.items():
            setattr(olympiad, k, v)

        olympiad.updated_at = datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved

    async def add_task(self, *, olympiad: Olympiad, task_id: int, sort_order: int, max_score: int) -> OlympiadTask:
        olympiad = await self._lock(olympiad)
        try:
            await self._ensure_editable(olympiad)
        except ValueError:
            raise ValueError(codes.CANNOT_MODIFY_PUBLISHED)


        task = await self.tasks.get(task_id)
        if not task or task.archived_at is not None:
            raise ValueError(codes.TASK_NOT_FOUND)

        existing = await self.olympiad_tasks.get_by_olympiad_task(olympiad.id, task_id)
        if existing:
            return existing

        obj = OlympiadTask(olympiad_id=olympiad.id, task_id=task_id, sort_order=sort_order, max_score=max_score)
        created = await self.olympiad_tasks.add(obj)
        await self._invalidate_cache(olympiad.id)
        return created

    async def remove_task(self, *, olympiad: Olympiad, task_id: int) -> None:
        olympiad = await self._lock(olympiad)
        try:
            await self._ensure_editable(olympiad)
        except ValueError:
            raise ValueError(codes.CANNOT_MODIFY_PUBLISHED)


        existing = await self.olympiad_tasks.get_by_olympiad_task(olympiad.id, task_id)
        if not existing:
            return
        await self.olympiad_tasks.delete(existing)
        await self._invalidate_cache(olympiad.id)

    async def publish(self, *, olympiad: Olympiad, publish: bool) -> Olympiad:
        olympiad = await self._lock(olympiad)
        if publish:
            if olympiad.archived_at:
                raise ValueError("material_archived")
            rows = await self.olympiad_tasks.list_full_by_olympiad(olympiad.id)
            if not rows:
                raise ValueError(codes.CANNOT_PUBLISH_EMPTY)
            for _, task in rows:
                TaskCreate(subject=task.subject, title=task.title, content=task.content,
                           task_type=task.task_type, image_key=task.image_key, payload=task.payload)
            if any(task.archived_at is not None for _, task in rows) and not olympiad.rules_locked_at:
                raise ValueError("material_archived")
            olympiad.rules_locked_at = olympiad.rules_locked_at or datetime.now(timezone.utc)
        olympiad.is_published = publish
        olympiad.updated_at = datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved

    async def release_results(self, *, olympiad: Olympiad, released: bool) -> Olympiad:
        olympiad.results_released = released
        olympiad.updated_at = datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved

    async def delete(self, *, olympiad: Olympiad) -> None:
        raise ValueError("physical_delete_disabled")

    async def archive(self, *, olympiad: Olympiad) -> Olympiad:
        olympiad = await self._lock(olympiad)
        olympiad.archived_at = olympiad.archived_at or datetime.now(timezone.utc)
        saved = await self.olympiads.save(olympiad)
        await self._invalidate_cache(olympiad.id)
        return saved

    async def copy(self, *, olympiad: Olympiad, admin_id: int) -> Olympiad:
        db = self.olympiads.db
        olympiad = await self._lock(olympiad)
        rows = await self.olympiad_tasks.list_full_by_olympiad(olympiad.id)
        if any(task.archived_at for _, task in rows):
            raise ValueError("archived_tasks_in_copy")
        copied = Olympiad(title=(olympiad.title[:249] + " копия"), description=olympiad.description,
            scope=olympiad.scope, age_group=olympiad.age_group, attempts_limit=1,
            duration_sec=olympiad.duration_sec, available_from=olympiad.available_from,
            available_to=olympiad.available_to, pass_percent=olympiad.pass_percent,
            is_published=False, results_released=False, created_by_user_id=admin_id)
        db.add(copied)
        await db.flush()
        rows = await self.olympiad_tasks.list_full_by_olympiad(olympiad.id)
        db.add_all([OlympiadTask(olympiad_id=copied.id, task_id=ot.task_id,
            sort_order=ot.sort_order, max_score=ot.max_score) for ot, task in rows if task.archived_at is None])
        await db.commit()
        await db.refresh(copied)
        return copied
