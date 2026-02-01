from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError

from app.core import error_codes as codes
from app.core.age_groups import class_grades_allow
from app.core.olympiad_pools import normalize_grade_group, normalize_subject
from app.models.olympiad_pool import OlympiadPool, OlympiadPoolItem, OlympiadAssignment
from app.repos.olympiad_assignments import OlympiadAssignmentsRepo
from app.repos.olympiad_pools import OlympiadPoolsRepo
from app.repos.olympiads import OlympiadsRepo


class OlympiadPoolsService:
    def __init__(
        self,
        pools_repo: OlympiadPoolsRepo,
        assignments_repo: OlympiadAssignmentsRepo,
        olympiads_repo: OlympiadsRepo,
    ):
        self.pools_repo = pools_repo
        self.assignments_repo = assignments_repo
        self.olympiads_repo = olympiads_repo

    @staticmethod
    def _dedupe_ids(values: list[int]) -> list[int]:
        seen: set[int] = set()
        result: list[int] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    async def create_pool(
        self,
        *,
        subject: str,
        grade_group: str,
        olympiad_ids: list[int],
        activate: bool,
        admin_id: int,
    ) -> tuple[OlympiadPool, list[OlympiadPoolItem]]:
        try:
            subject_norm = normalize_subject(subject)
        except ValueError as exc:
            raise ValueError(codes.INVALID_SUBJECT) from exc
        try:
            grade_norm = normalize_grade_group(grade_group)
        except ValueError as exc:
            raise ValueError(codes.INVALID_AGE_GROUP) from exc

        unique_ids = self._dedupe_ids(olympiad_ids)
        if not unique_ids:
            raise ValueError(codes.OLYMPIAD_POOL_EMPTY)

        existing = await self.olympiads_repo.list_by_ids(unique_ids)
        if len(existing) != len(unique_ids):
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)

        pool = await self.pools_repo.create_pool(
            OlympiadPool(
                subject=subject_norm,
                grade_group=grade_norm,
                is_active=False,
                created_by_user_id=admin_id,
            )
        )

        items = [
            OlympiadPoolItem(pool_id=pool.id, olympiad_id=olympiad_id, position=index + 1)
            for index, olympiad_id in enumerate(unique_ids)
        ]
        await self.pools_repo.create_items(items)

        if activate:
            pool = await self.pools_repo.activate_pool(pool)

        return pool, items

    async def list_pools(self, subject: str | None, limit: int, offset: int) -> list[dict]:
        subject_norm = None
        if subject:
            subject_norm = normalize_subject(subject)
        pools = await self.pools_repo.list_pools(subject_norm, limit=limit, offset=offset)
        pool_ids = [pool.id for pool in pools]
        items = await self.pools_repo.list_items_for_pools(pool_ids)
        items_by_pool: dict[int, list[int]] = {}
        for item in items:
            items_by_pool.setdefault(item.pool_id, []).append(item.olympiad_id)
        return [
            {
                "id": pool.id,
                "subject": pool.subject,
                "grade_group": pool.grade_group,
                "is_active": pool.is_active,
                "created_by_user_id": pool.created_by_user_id,
                "created_at": pool.created_at,
                "olympiad_ids": items_by_pool.get(pool.id, []),
            }
            for pool in pools
        ]

    async def activate_pool(self, pool_id: int) -> dict:
        pool = await self.pools_repo.get_pool(pool_id)
        if not pool:
            raise ValueError(codes.OLYMPIAD_POOL_NOT_FOUND)
        pool = await self.pools_repo.activate_pool(pool)
        items = await self.pools_repo.list_items(pool.id)
        return {
            "id": pool.id,
            "subject": pool.subject,
            "grade_group": pool.grade_group,
            "is_active": pool.is_active,
            "created_by_user_id": pool.created_by_user_id,
            "created_at": pool.created_at,
            "olympiad_ids": [item.olympiad_id for item in items],
        }

    async def _ensure_assignment(
        self,
        *,
        user_id: int,
        pool: OlympiadPool,
        olympiad_ids: list[int],
    ) -> OlympiadAssignment:
        assignment = await self.assignments_repo.get_for_user_pool(user_id, pool.id)
        if assignment:
            return assignment
        if not olympiad_ids:
            raise ValueError(codes.OLYMPIAD_POOL_EMPTY)
        index = (user_id - 1) % len(olympiad_ids)
        olympiad_id = olympiad_ids[index]
        try:
            assignment = await self.assignments_repo.create_assignment(
                OlympiadAssignment(user_id=user_id, pool_id=pool.id, olympiad_id=olympiad_id)
            )
        except IntegrityError:
            assignment = await self.assignments_repo.get_for_user_pool(user_id, pool.id)
            if assignment is None:
                raise
        return assignment

    async def assign_for_user(self, *, user: User, subject: str):
        try:
            subject_norm = normalize_subject(subject)
        except ValueError as exc:
            raise ValueError(codes.INVALID_SUBJECT) from exc

        pool = await self.pools_repo.get_active_pool(subject_norm)
        if not pool:
            raise ValueError(codes.OLYMPIAD_POOL_NOT_ACTIVE)

        if not class_grades_allow(pool.grade_group, user.class_grade):
            raise ValueError(codes.OLYMPIAD_AGE_GROUP_MISMATCH)

        olympiad_ids = await self.pools_repo.list_pool_olympiad_ids(pool.id)
        assignment = await self._ensure_assignment(user_id=user.id, pool=pool, olympiad_ids=olympiad_ids)
        olympiad = await self.olympiads_repo.get(assignment.olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        if not olympiad.is_published:
            raise ValueError(codes.OLYMPIAD_NOT_PUBLISHED)
        now = datetime.now(timezone.utc)
        if now < olympiad.available_from or now > olympiad.available_to:
            raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        return olympiad
