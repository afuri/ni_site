from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.core.errors import http_error
from app.models.task import Task
from app.models.task_upload import TaskUploadSession
from app.schemas.tasks import TaskCreate
from app.services.audit_events import add_audit_event
from app.services.task_archive import ArchiveError, PreparedArchive, parse_archive
from app.services.task_images import image_work as archive_work


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def get_session(db: AsyncSession, token: str, author_id: int, *, lock: bool = False) -> TaskUploadSession:
    statement = select(TaskUploadSession).where(TaskUploadSession.token == token, TaskUploadSession.author_id == author_id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    session = (await db.scalars(statement)).one_or_none()
    if session is None:
        raise http_error(404, "task_upload_not_found", "Сессия загрузки не найдена.")
    if session.expires_at <= now_utc():
        raise http_error(410, "task_upload_expired", "Время просмотра истекло. Оставшиеся задания можно добавить вручную.")
    return session


def upload_images(prepared: PreparedArchive, token: str) -> dict[str, str]:
    keys = {}
    for ref, (binary, mime) in prepared.images.items():
        ext = storage.CONTENT_TYPE_EXT[mime]
        key = f"tasks/imports/{token}/{ref}.{ext}"
        storage.put_object(key, binary, mime)
        keys[ref] = key
    return keys


async def create_upload(db: AsyncSession, token: str, author_id: int, raw: bytes) -> TaskUploadSession:
    digest = hashlib.sha256(raw).hexdigest()
    existing = await db.get(TaskUploadSession, token)
    if existing:
        session = await get_session(db, token, author_id)
        if session.archive_sha256 != digest:
            raise http_error(409, "task_upload_token_reused", "Этот запрос уже относится к другому архиву.")
        return session
    # Release the authorization/read transaction before bounded CPU/storage work.
    await db.commit()
    try:
        prepared = await archive_work(parse_archive, raw)
    except ArchiveError as exc:
        raise http_error(422, "task_archive_invalid", str(exc)) from exc
    claim = insert(TaskUploadSession).values(token=token, author_id=author_id, archive_sha256=digest,
        status="preparing", data=prepared.data, expires_at=now_utc() + timedelta(seconds=settings.TASK_UPLOAD_PREPARING_TTL_SEC))
    claimed = (await db.execute(claim.on_conflict_do_nothing(index_elements=[TaskUploadSession.token]).returning(TaskUploadSession.token))).scalar_one_or_none()
    await db.commit()
    if claimed is None:
        session = await get_session(db, token, author_id)
        if session.archive_sha256 != digest:
            raise http_error(409, "task_upload_token_reused")
        return session
    try:
        keys = await archive_work(upload_images, prepared, token)
    except Exception as exc:
        session = await get_session(db, token, author_id, lock=True)
        if session.status == "preparing":
            session.status = "failed"
            session.data = {**prepared.data, "error": "Не удалось загрузить изображения в хранилище."}
            session.expires_at = now_utc() + timedelta(seconds=settings.TASK_UPLOAD_RESULT_TTL_SEC)
        await db.commit()
        raise http_error(503, "storage_unavailable", "Не удалось загрузить изображения в хранилище.") from exc
    session = await get_session(db, token, author_id, lock=True)
    if session.status == "preparing":
        data = deepcopy(prepared.data)
        for item in data["items"]:
            item["image_key"] = keys.get(item.pop("image_ref", None))
        session.data = data
        session.status = "reviewing"
        session.expires_at = now_utc() + timedelta(seconds=settings.TASK_UPLOAD_ACTIVE_TTL_SEC)
    await db.commit()
    return session


async def snapshot(session: TaskUploadSession) -> dict:
    data = deepcopy(session.data)
    items = data["items"]
    pending = next(((i, item) for i, item in enumerate(items) if item["status"] == "pending"), None)
    current = None
    if pending is not None and session.status == "reviewing":
        item = pending[1]
        current = {k: item[k] for k in ("index", "title", "content", "task_type", "payload", "errors")}
        try:
            current["image_url"] = (storage.public_url_for_key(item["image_key"]) or
                                    await archive_work(storage.presign_get, item["image_key"])) if item["image_key"] else None
        except Exception as exc:
            raise http_error(503, "storage_unavailable", "Не удалось открыть предпросмотр изображения.") from exc
    return {"token": session.token, "status": session.status, "pool_title": data["pool_title"],
            "subject": data["subject"], "grade": data["grade"], "total": len(items),
            "saved": sum(i["status"] == "saved" for i in items),
            "skipped": sum(i["status"] == "skipped" for i in items),
            "current_number": pending[0] + 1 if current else None, "current": current,
            "saved_task_ids": [i["task_id"] for i in items if i["status"] == "saved"],
            "skipped_items": [{"index": i["index"], "reason": i["reason"], "errors": i["errors"]}
                              for i in items if i["status"] == "skipped"], "error": data.get("error")}


async def decide(db: AsyncSession, token: str, author_id: int, index: str, action: str) -> TaskUploadSession:
    session = await get_session(db, token, author_id, lock=True)
    data = deepcopy(session.data)
    item = next((i for i in data["items"] if i["index"] == index), None)
    if item is None:
        raise http_error(404, "task_upload_item_not_found")
    target = "saved" if action == "save" else "skipped"
    if item["status"] == target:
        await db.commit()
        return session
    pending = next((i for i in data["items"] if i["status"] == "pending"), None)
    if session.status != "reviewing" or item["status"] != "pending" or item is not pending:
        raise http_error(409, "task_upload_step_changed", "Это задание уже обработано или очередь просмотра изменилась.")
    if action == "save":
        if item["errors"]:
            raise http_error(422, "task_upload_item_invalid", "Задание содержит ошибки и может быть только пропущено.")
        payload = TaskCreate(subject=data["subject"], **{k: item[k] for k in ("title", "content", "task_type", "image_key", "payload")})
        task = Task(**payload.model_dump(), created_by_user_id=author_id)
        db.add(task)
        await db.flush()
        item["task_id"] = task.id
        add_audit_event(db, actor_user_id=author_id, action="task_created", method="POST",
                        path="/api/v1/admin/tasks", details={"task_id": task.id})
    else:
        item["reason"] = "validation_error" if item["errors"] else "skipped"
    item["status"] = target
    session.data = data
    session.expires_at = now_utc() + timedelta(seconds=settings.TASK_UPLOAD_ACTIVE_TTL_SEC)
    if all(i["status"] != "pending" for i in data["items"]):
        session.status = "completed"
        session.expires_at = now_utc() + timedelta(seconds=settings.TASK_UPLOAD_RESULT_TTL_SEC)
    await db.commit()
    return session


async def cancel(db: AsyncSession, token: str, author_id: int) -> TaskUploadSession:
    session = await get_session(db, token, author_id, lock=True)
    if session.status not in ("completed", "cancelled"):
        data = deepcopy(session.data)
        for item in data["items"]:
            if item["status"] == "pending":
                item.update(status="skipped", reason="cancelled")
        session.data = data
        session.status = "cancelled"
        session.expires_at = now_utc() + timedelta(seconds=settings.TASK_UPLOAD_RESULT_TTL_SEC)
    await db.commit()
    return session


async def cleanup_uploads(*, session_maker) -> dict[str, int]:
    now = now_utc()
    async with session_maker() as db:
        candidates = select(TaskUploadSession.token).where(TaskUploadSession.expires_at <= now).limit(1000).with_for_update(skip_locked=True)
        result = await db.execute(delete(TaskUploadSession).where(TaskUploadSession.token.in_(candidates)))
        deleted_sessions = result.rowcount or 0
        await db.commit()
    cutoff = now - timedelta(days=settings.TASK_UPLOAD_IMAGE_RETENTION_DAYS)
    keys = await archive_work(storage.old_import_image_keys, cutoff)
    deleted_images = 0
    # Unique upload prefixes prevent cleanup from racing a newer upload's images.
    for offset in range(0, len(keys), 200):
        batch = keys[offset:offset + 200]
        async with session_maker() as db:
            used = set((await db.scalars(select(Task.image_key).where(Task.image_key.in_(batch)))).all())
            sessions = list((await db.scalars(select(TaskUploadSession).where(TaskUploadSession.expires_at > now,
                            TaskUploadSession.status.in_(["preparing", "reviewing"])))).all())
            used.update(item["image_key"] for session in sessions for item in session.data["items"] if item.get("image_key"))
            for key in batch:
                if key not in used:
                    await archive_work(storage.delete_object, key)
                    deleted_images += 1
    return {"sessions": deleted_sessions, "images": deleted_images}
