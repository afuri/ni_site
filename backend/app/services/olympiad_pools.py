from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import load_only
from app.core.age_groups import class_grades_allow
from app.core import error_codes as codes
from app.core.olympiad_pools import normalize_grade_group, normalize_subject
from app.models.olympiad_pool import OlympiadPool, OlympiadPoolItem, OlympiadAssignment
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask
from app.models.task import Task
from app.models.attempt import Attempt, AttemptStatus
from app.repos.attempts import AttemptsRepo
from app.repos.users import UsersRepo
from app.models.user import UserRole
from app.schemas.olympiads import OlympiadPublicRead
from app.services.olympiad_availability import validate_pool


class OlympiadPoolsService:
    def __init__(self, pools_repo, assignments_repo, olympiads_repo):
        self.pools_repo = pools_repo
        self.assignments_repo = assignments_repo
        self.olympiads_repo = olympiads_repo
        self.db = pools_repo.db

    @staticmethod
    def read(pool, items):
        return dict(id=pool.id, subject=pool.subject, is_trial=pool.is_trial,
            grade_group=pool.grade_group, is_active=pool.is_active,
            created_by_user_id=pool.created_by_user_id, created_at=pool.created_at,
            olympiad_ids=[item.olympiad_id for item in items])

    async def list_pools(self, subject=None, limit=200, offset=0):
        pools = await self.pools_repo.list_pools(normalize_subject(subject) if subject else None, limit, offset)
        items = await self.pools_repo.list_items_for_pools([pool.id for pool in pools])
        return [self.read(pool, [item for item in items if item.pool_id == pool.id]) for pool in pools]

    async def create_pool(self, *, subject, grade_group, olympiad_ids, activate, admin_id, is_trial=False):
        subject = normalize_subject(subject)
        grade_group = normalize_grade_group(grade_group)
        if len(olympiad_ids) != 4 or len(set(olympiad_ids)) != 4:
            raise ValueError("olympiad_pool_invalid")
        variants = list((await self.db.scalars(select(Olympiad).where(Olympiad.id.in_(olympiad_ids))
            .order_by(Olympiad.id).with_for_update())).all())
        if len(variants) != 4:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        if await self.db.scalar(select(OlympiadPoolItem.id).where(OlympiadPoolItem.olympiad_id.in_(olympiad_ids)).limit(1)):
            raise ValueError("olympiad_variant_already_used")
        pool = OlympiadPool(subject=subject, grade_group=grade_group, is_active=False,
            is_trial=is_trial, created_by_user_id=admin_id)
        self.db.add(pool)
        await self.db.flush()
        items = [OlympiadPoolItem(pool_id=pool.id, olympiad_id=oid, position=i+1) for i, oid in enumerate(olympiad_ids)]
        self.db.add_all(items)
        await self.db.flush()
        if activate:
            bundle = await self.pools_repo.load_bundle(pool.id)
            validate_pool(*bundle, require_active=False)
            pool.is_active = True
        await self.db.commit()
        return pool, items

    async def activate_pool(self, pool_id):
        bundle = await self.pools_repo.load_bundle(pool_id, lock=True)
        validate_pool(*bundle, require_active=False)
        pool, items, variants, compositions = bundle
        pool.is_active = True
        await self.db.commit()
        return self.read(pool, items)

    async def chosen_variant(self, user, bundle, *, now=None):
        pool, items, variants, compositions = bundle
        validate_pool(*bundle, user=user, now=now, validate_payloads=False)
        assignment = await self.assignments_repo.get_for_user_pool(user.id, pool.id)
        oid = assignment.olympiad_id if assignment else next(item.olympiad_id for item in items if item.position == ((user.id-1)%4)+1)
        if oid not in variants:
            raise ValueError("olympiad_pool_invalid")
        return variants[oid]

    async def remember(self, user_id, pool_id, olympiad_id):
        await self.db.execute(insert(OlympiadAssignment).values(user_id=user_id, pool_id=pool_id, olympiad_id=olympiad_id)
            .on_conflict_do_nothing(index_elements=["user_id", "pool_id"]))

    async def assign_for_user(self, *, user, pool_id):
        await AttemptsRepo(self.db).lock_user_for_start(user.id)
        user = await UsersRepo(self.db).get_by_id(user.id, minimal=True)
        if not user or not user.is_active or user.role != UserRole.student:
            raise ValueError(codes.FORBIDDEN)
        bundle = await self.pools_repo.load_bundle(pool_id, lock="share", full=False)
        olympiad = await self.chosen_variant(user, bundle, now=datetime.now(timezone.utc))
        await self.remember(user.id, pool_id, olympiad.id)
        await self.db.commit()
        return OlympiadPublicRead.model_validate(olympiad).model_dump() | dict(pool_id=pool_id, subject=bundle[0].subject, is_trial=bundle[0].is_trial)

    async def list_for_user(self, user):
        # Five batched reads regardless of the number of available works.
        pools = list((await self.db.scalars(select(OlympiadPool).where(OlympiadPool.is_active.is_(True)))).all())
        eligible = []
        for pool in pools:
            try:
                if class_grades_allow(pool.grade_group, user.class_grade):
                    eligible.append(pool)
            except ValueError:
                continue  # Keep malformed historical pools out of new admission.
        pools = eligible
        if not pools:
            return []
        now = datetime.now(timezone.utc)
        rows = (await self.db.execute(select(OlympiadPoolItem, Olympiad).join(Olympiad, Olympiad.id == OlympiadPoolItem.olympiad_id)
            .where(OlympiadPoolItem.pool_id.in_([p.id for p in pools]), Olympiad.available_to >= now)
            .order_by(OlympiadPoolItem.position))).all()
        grouped = {}
        for item, olympiad in rows:
            grouped.setdefault(item.pool_id, []).append((item, olympiad))
        variant_ids = [o.id for _, o in rows]
        compositions = {}
        for link, task in (await self.db.execute(select(OlympiadTask, Task).join(Task, Task.id == OlympiadTask.task_id)
                .options(load_only(Task.id, Task.subject)).where(OlympiadTask.olympiad_id.in_(variant_ids)))).all():
            compositions.setdefault(link.olympiad_id, []).append((link, task))
        assignments = {a.pool_id: a.olympiad_id for a in (await self.db.scalars(select(OlympiadAssignment).where(OlympiadAssignment.user_id == user.id))).all()}
        attempts = {a.olympiad_id: a for a in (await self.db.scalars(select(Attempt).where(Attempt.user_id == user.id))).all()}
        result = []
        for pool in pools:
            selected = grouped.get(pool.id, [])
            items = [item for item, _ in selected]
            variants = {o.id: o for _, o in selected}
            try:
                validate_pool(pool, items, variants, compositions, user=user, validate_payloads=False)
            except ValueError:
                continue
            oid = assignments.get(pool.id) or next(item.olympiad_id for item in items if item.position == ((user.id-1)%4)+1)
            olympiad = variants.get(oid)
            if olympiad is None or olympiad.available_to < now:
                continue
            attempt = attempts.get(oid)
            if attempt and (attempt.status != AttemptStatus.active or attempt.deadline_at < now):
                continue
            result.append(OlympiadPublicRead.model_validate(olympiad).model_dump() | dict(pool_id=pool.id, subject=pool.subject, is_trial=pool.is_trial))
        return sorted(result, key=lambda value: (value['available_from'], value['id']))

    async def copy_pool(self, pool_id, admin_id):
        pool, items, variants, compositions = await self.pools_repo.load_bundle(pool_id, lock=True)
        if len(items) != 4 or sorted(i.position for i in items) != [1,2,3,4]:
            raise ValueError("olympiad_pool_invalid")
        if any(task.archived_at for rows in compositions.values() for _, task in rows):
            raise ValueError("archived_tasks_in_copy")
        copied_pool = OlympiadPool(subject=pool.subject, grade_group=pool.grade_group, is_trial=pool.is_trial,
            is_active=False, created_by_user_id=admin_id)
        self.db.add(copied_pool)
        await self.db.flush()
        copied_items = []
        for item in items:
            o = variants[item.olympiad_id]
            copied = Olympiad(title=o.title[:249]+" копия", description=o.description, scope=o.scope,
                age_group=o.age_group, attempts_limit=1, duration_sec=o.duration_sec,
                available_from=o.available_from, available_to=o.available_to, pass_percent=o.pass_percent,
                is_published=False, results_released=False, created_by_user_id=admin_id)
            self.db.add(copied)
            await self.db.flush()
            copied_items.append(OlympiadPoolItem(pool_id=copied_pool.id, olympiad_id=copied.id, position=item.position))
            self.db.add_all([OlympiadTask(olympiad_id=copied.id, task_id=link.task_id, sort_order=link.sort_order,
                max_score=link.max_score) for link, _ in compositions.get(o.id, [])])
        self.db.add_all(copied_items)
        await self.db.commit()
        return self.read(copied_pool, copied_items)
