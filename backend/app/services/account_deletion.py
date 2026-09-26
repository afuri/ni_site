import asyncio
import re
from sqlalchemy import delete, select, update, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.storage import _get_s3_client
from app.models.account_deletion import AccountDeletionCleanup
from app.models.audit_log import AuditLog
from app.models.user_change import UserChange
from app.models.user import User
from app.models.content import ContentItem
from app.models.task import Task
from app.models.olympiad_pool import OlympiadPool
from app.models.olympiad import Olympiad
from app.services.audit_events import add_audit_event


def purge_files(user_id: int, attempt_ids: list[int]) -> None:
    """Exact keys only. Do not suppress storage/listing/partial deletion failures."""
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_unavailable")
    keys = {f"attempt_{int(attempt_id)}.jpg" for attempt_id in attempt_ids}
    pattern = re.compile(rf"^certificates/teachers/\d{{4}}_\d{{4}}/certificate_{user_id}_\d{{4}}_\d{{4}}_\d{{2}}\.jpg$", re.I)
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=settings.STORAGE_BUCKET, Prefix="certificates/teachers/"):
        keys.update(item["Key"] for item in page.get("Contents", []) if pattern.fullmatch(item["Key"]))
    ordered = sorted(keys)
    for offset in range(0, len(ordered), 1000):
        response = client.delete_objects(Bucket=settings.STORAGE_BUCKET, Delete={"Objects": [{"Key": key} for key in ordered[offset:offset + 1000]]})
        if response.get("Errors"):
            raise RuntimeError("storage_delete_failed")
    # Versioned buckets retain old public data behind delete markers.
    if client.get_bucket_versioning(Bucket=settings.STORAGE_BUCKET).get("Status") in {"Enabled", "Suspended"}:
        versions = []
        prefixes = [f"attempt_{int(value)}.jpg" for value in attempt_ids] + ["certificates/teachers/"]
        for prefix in prefixes:
            for page in client.get_paginator("list_object_versions").paginate(Bucket=settings.STORAGE_BUCKET, Prefix=prefix):
                for item in page.get("Versions", []) + page.get("DeleteMarkers", []):
                    if item["Key"] in keys or pattern.fullmatch(item["Key"]):
                        versions.append({"Key": item["Key"], "VersionId": item["VersionId"]})
        for offset in range(0, len(versions), 1000):
            response = client.delete_objects(Bucket=settings.STORAGE_BUCKET, Delete={"Objects": versions[offset:offset + 1000]})
            if response.get("Errors"):
                raise RuntimeError("storage_delete_failed")


async def cleanup_files(db: AsyncSession, user_id: int) -> bool:
    job = await db.scalar(select(AccountDeletionCleanup).where(AccountDeletionCleanup.user_id == user_id).with_for_update(skip_locked=True))
    if job is None:
        await db.rollback()
        return await db.get(AccountDeletionCleanup, user_id) is None
    try:
        await asyncio.to_thread(purge_files, job.user_id, job.attempt_ids)
        await db.delete(job)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False


async def erase_database_user(db: AsyncSession, user: User, actor_id: int, attempt_ids: list[int]) -> None:
    # Shared educational content must not cascade into other people's results.
    for model, column in ((Task, Task.created_by_user_id), (Olympiad, Olympiad.created_by_user_id), (OlympiadPool, OlympiadPool.created_by_user_id), (ContentItem, ContentItem.author_id), (ContentItem, ContentItem.published_by_id)):
        await db.execute(update(model).where(column == user.id).values({column.key: actor_id}))
    # The manual list stores teacher IDs and names without foreign keys.
    await db.execute(text("""
        UPDATE users SET manual_teachers = COALESCE((
          SELECT jsonb_agg(item) FROM jsonb_array_elements(manual_teachers) item
          WHERE item->>'id' IS DISTINCT FROM :user_id
        ), '[]'::jsonb)
        WHERE manual_teachers @> CAST(:needle AS jsonb)
    """), {"user_id": str(user.id), "needle": '[{"id":' + str(user.id) + '}]'})
    await db.execute(delete(UserChange).where(or_(UserChange.target_user_id == user.id, UserChange.actor_user_id == user.id)))
    await db.execute(delete(AuditLog).where(or_(AuditLog.user_id == user.id,
        AuditLog.details["target_user_id"].astext == str(user.id), AuditLog.details["user_id"].astext == str(user.id))))
    db.add(AccountDeletionCleanup(user_id=user.id, attempt_ids=attempt_ids))
    # All FK-owned rows, including answers/grades/tokens, use ON DELETE CASCADE.
    await db.execute(delete(User).where(User.id == user.id))
    add_audit_event(db, actor_user_id=actor_id, action="account_deleted", method="DELETE",
        path="/api/v1/admin/account-deletions", details={"deleted_user_id": user.id})
    await db.commit()
