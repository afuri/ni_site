"""Shared admission rules. The complete pool is validated before assignment."""
from datetime import datetime
from app.core.age_groups import normalize_age_group, class_grades_allow
from app.core import error_codes as codes
from app.schemas.tasks import TaskCreate


def validate_pool(pool, items, variants, compositions, *, now: datetime | None = None, user=None, require_active=True, validate_payloads=True):
    if require_active and not pool.is_active:
        raise ValueError(codes.OLYMPIAD_POOL_NOT_ACTIVE)
    if len(items) != 4 or sorted(item.position for item in items) != [1, 2, 3, 4]:
        raise ValueError("olympiad_pool_invalid")
    if len(variants) != 4:
        raise ValueError("olympiad_pool_invalid")
    ordered = [variants[item.olympiad_id] for item in items]
    first = ordered[0]
    for olympiad in ordered:
        if getattr(olympiad, "is_standalone", False):
            raise ValueError(codes.STANDALONE_OLYMPIAD_IN_POOL)
        if olympiad.archived_at or not olympiad.is_published:
            raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
        if (normalize_age_group(olympiad.age_group) != normalize_age_group(pool.grade_group)
            or normalize_age_group(olympiad.age_group) != normalize_age_group(first.age_group)
            or olympiad.available_from != first.available_from
            or olympiad.available_to != first.available_to
            or olympiad.duration_sec != first.duration_sec):
            raise ValueError("olympiad_pool_invalid")
        rows = compositions.get(olympiad.id, [])
        if not rows:
            raise ValueError(codes.OLYMPIAD_HAS_NO_TASKS)
        for link, task in rows:
            if task.subject.value != pool.subject or link.max_score <= 0 or link.sort_order < 0:
                raise ValueError("olympiad_pool_invalid")
            if validate_payloads:
                TaskCreate(subject=task.subject, title=task.title, content=task.content,
                    task_type=task.task_type, image_key=task.image_key, payload=task.payload)
    if user is not None and not class_grades_allow(pool.grade_group, user.class_grade):
        raise ValueError(codes.OLYMPIAD_AGE_GROUP_MISMATCH)
    if now is not None and not first.available_from <= now <= first.available_to:
        raise ValueError(codes.OLYMPIAD_NOT_AVAILABLE)
    return ordered
