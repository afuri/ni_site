"""Find possible duplicate student accounts without changing user data."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import Attempt
from app.models.user import User, UserRole


def _normalized_name(column):
    # PostgreSQL normalization is deliberately conservative: spelling, punctuation
    # and word order remain significant; a match is never proof of identity.
    return func.btrim(
        func.regexp_replace(
            func.replace(func.lower(func.coalesce(column, "")), "ё", "е"),
            "[[:space:]]+",
            " ",
            "g",
        )
    )


async def find_duplicate_candidates(db: AsyncSession, *, limit: int, offset: int) -> dict:
    surname = _normalized_name(User.surname)
    name = _normalized_name(User.name)
    father_name = _normalized_name(User.father_name)
    normalized = (
        select(
            User.id.label("user_id"),
            surname.label("surname"),
            name.label("name"),
            father_name.label("father_name"),
            User.school_id.label("school_id"),
        )
        .where(
            User.role == UserRole.student,
            User.school_id.is_not(None),
            surname != "",
            name != "",
            father_name != "",
        )
        .cte("normalized_students")
    )

    grouped = (
        select(
            normalized.c.surname,
            normalized.c.name,
            normalized.c.father_name,
            normalized.c.school_id,
            func.min(normalized.c.user_id).label("group_id"),
            func.array_agg(normalized.c.user_id).label("user_ids"),
        )
        .group_by(
            normalized.c.surname,
            normalized.c.name,
            normalized.c.father_name,
            normalized.c.school_id,
        )
        .having(func.count() > 1)
        .cte("candidate_groups")
    )

    total_groups = int(await db.scalar(select(func.count()).select_from(grouped)) or 0)
    rows = (
        await db.execute(
            select(grouped).order_by(grouped.c.group_id).limit(limit).offset(offset)
        )
    ).all()
    if not rows:
        return {"total_groups": total_groups, "groups": []}

    ids = [int(user_id) for row in rows for user_id in row.user_ids]
    users = (await db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id))).all()
    users_by_id = {user.id: user for user in users}
    attempts = (
        await db.execute(
            select(Attempt.user_id, func.count(Attempt.id))
            .where(Attempt.user_id.in_(ids))
            .group_by(Attempt.user_id)
        )
    ).all()
    attempts_by_user = {int(user_id): int(count) for user_id, count in attempts}

    groups = []
    for row in rows:
        candidates = []
        for user_id in sorted(row.user_ids):
            user = users_by_id.get(int(user_id))
            if user is None:
                continue  # An account may have been removed between the two read queries.
            candidates.append({
                "id": user.id,
                "login": user.login,
                "email": user.email,
                "surname": user.surname,
                "name": user.name,
                "father_name": user.father_name,
                "class_grade": user.class_grade,
                "region_id": user.region_id,
                "region_name": user.region_name,
                "school_id": user.school_id,
                "school_short_name": user.school_short_name,
                "city_name": user.city_name,
                "school_status": user.school_status.value,
                "is_active": user.is_active,
                "is_email_verified": user.is_email_verified,
                "created_at": user.created_at,
                "attempt_count": attempts_by_user.get(user.id, 0),
            })
        if candidates:
            groups.append({
                "group_id": row.group_id,
                "users": candidates,
            })
    return {"total_groups": total_groups, "groups": groups}
