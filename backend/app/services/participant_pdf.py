"""Prepared participant PDFs: private storage, bounded I/O, server-side admission."""
from datetime import datetime, timezone
from uuid import uuid4

from botocore.exceptions import ClientError
from fastapi import UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from app.core import error_codes as codes
from app.core.age_groups import class_grades_allow
from app.core.config import settings
from app.core.errors import http_error
from app.core.storage import _get_s3_client
from app.models.attempt import Attempt, AttemptStatus
from app.models.olympiad import Olympiad
from app.models.user import User, UserRole
from app.repos.olympiad_tasks import OlympiadTasksRepo
from app.repos.olympiads import OlympiadsRepo
from app.repos.tasks import TasksRepo
from app.services.audit_events import add_audit_event
from app.services.olympiads_admin import AdminOlympiadsService

MAX_PDF_BYTES = 20 * 1024 * 1024


def private_bucket() -> str:
    bucket = settings.STORAGE_PRIVATE_BUCKET or f"{settings.STORAGE_BUCKET}-private"
    if bucket == settings.STORAGE_BUCKET:
        raise RuntimeError("participant_pdf_requires_separate_private_bucket")
    return bucket


def store_pdf(key: str, data: bytes) -> None:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    bucket = private_bucket()
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        if str(exc.response.get("Error", {}).get("Code")) not in {"404", "NoSuchBucket", "NotFound"}:
            raise
        params = {"Bucket": bucket}
        if settings.STORAGE_REGION != "us-east-1":
            params["CreateBucketConfiguration"] = {"LocationConstraint": settings.STORAGE_REGION}
        try:
            client.create_bucket(**params)  # New buckets are private by default.
        except ClientError as create_exc:
            if create_exc.response.get("Error", {}).get("Code") != "BucketAlreadyOwnedByYou":
                raise
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/pdf")


def open_pdf(key: str):
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    response = client.get_object(Bucket=private_bucket(), Key=key)
    if not 0 < response.get("ContentLength", 0) <= MAX_PDF_BYTES:
        response["Body"].close()
        raise RuntimeError("invalid_stored_pdf_size")
    return response


def iter_pdf(body):
    # StreamingResponse executes this synchronous iterator off the event loop.
    try:
        while chunk := body.read(64 * 1024):
            yield chunk
    finally:
        body.close()


class ParticipantPdfService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.admin_service = AdminOlympiadsService(OlympiadsRepo(db), OlympiadTasksRepo(db), TasksRepo(db))

    async def get_olympiad(self, olympiad_id: int, *, lock=False) -> Olympiad:
        stmt = select(Olympiad).where(Olympiad.id == olympiad_id)
        if lock:
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        olympiad = await self.db.scalar(stmt)
        if not olympiad:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        if not olympiad.is_standalone:
            raise http_error(409, codes.PARTICIPANT_PDF_NOT_ALLOWED, message="PDF для участника разрешён только для общих олимпиад.")
        return olympiad

    async def ensure_editable(self, olympiad: Olympiad) -> None:
        try:
            await self.admin_service._ensure_editable(olympiad)
        except ValueError:
            raise http_error(409, codes.CANNOT_CHANGE_PUBLISHED_RULES, message="PDF можно менять только в редактируемом черновике.")

    async def upload(self, olympiad_id: int, file: UploadFile, admin_id: int) -> Olympiad:
        # Check permission before reading or uploading bytes; lock through commit.
        olympiad = await self.get_olympiad(olympiad_id, lock=True)
        await self.ensure_editable(olympiad)
        data = await file.read(MAX_PDF_BYTES + 1)
        if len(data) > MAX_PDF_BYTES:
            raise http_error(413, codes.PARTICIPANT_PDF_TOO_LARGE, message="Размер PDF не должен превышать 20 МБ.")
        if (file.content_type not in {"application/pdf", "application/octet-stream"}
                or not (file.filename or "").lower().endswith(".pdf")
                or not data.startswith(b"%PDF-") or not data.rstrip().endswith(b"%%EOF")):
            raise http_error(422, codes.PARTICIPANT_PDF_INVALID, message="Выберите проверенный файл в формате PDF.")
        key = f"participant-pdfs/{olympiad_id}/{uuid4().hex}.pdf"
        try:
            await run_in_threadpool(store_pdf, key, data)
        except Exception:
            raise http_error(503, codes.STORAGE_UNAVAILABLE, message="Не удалось сохранить PDF в приватном хранилище.")
        olympiad.participant_pdf_key = key
        olympiad.updated_at = datetime.now(timezone.utc)
        add_audit_event(self.db, actor_user_id=admin_id, action="participant_pdf_uploaded", method="PUT",
                        path=f"/api/v1/admin/olympiads/{olympiad_id}/participant-pdf", details={"olympiad_id": olympiad_id, "bytes": len(data)})
        await self.db.commit()
        await self.admin_service._invalidate_cache(olympiad_id)
        return olympiad

    async def remove(self, olympiad_id: int, admin_id: int) -> Olympiad:
        olympiad = await self.get_olympiad(olympiad_id, lock=True)
        await self.ensure_editable(olympiad)
        olympiad.participant_pdf_key = None
        olympiad.updated_at = datetime.now(timezone.utc)
        add_audit_event(self.db, actor_user_id=admin_id, action="participant_pdf_removed", method="DELETE",
                        path=f"/api/v1/admin/olympiads/{olympiad_id}/participant-pdf", details={"olympiad_id": olympiad_id})
        await self.db.commit()
        await self.admin_service._invalidate_cache(olympiad_id)
        # Keep superseded private objects recoverable; there is no public URL.
        return olympiad

    async def download(self, olympiad_id: int, user: User) -> StreamingResponse:
        olympiad = await self.get_olympiad(olympiad_id)
        if user.role != UserRole.admin:
            if user.role != UserRole.student or not user.is_active:
                raise http_error(403, codes.FORBIDDEN)
            if not user.is_email_verified:
                raise http_error(403, codes.EMAIL_NOT_VERIFIED)
            try:
                allowed = class_grades_allow(olympiad.age_group, user.class_grade)
            except ValueError:
                allowed = False
            if not allowed:
                raise http_error(409, codes.OLYMPIAD_AGE_GROUP_MISMATCH)
            now = datetime.now(timezone.utc)
            attempt = await self.db.scalar(select(Attempt).where(
                Attempt.user_id == user.id, Attempt.olympiad_id == olympiad_id,
            ).limit(1))
            if attempt is not None and (attempt.status != AttemptStatus.active or now > attempt.deadline_at):
                raise http_error(409, codes.OLYMPIAD_NOT_AVAILABLE, message="После завершения или истечения попытки PDF недоступен.")
            if (not olympiad.is_published or olympiad.archived_at
                    or not (olympiad.available_from <= now <= olympiad.available_to or attempt is not None)):
                raise http_error(409, codes.OLYMPIAD_NOT_AVAILABLE)
        if not olympiad.participant_pdf_key:
            raise http_error(404, codes.PARTICIPANT_PDF_NOT_FOUND)
        try:
            stored = await run_in_threadpool(open_pdf, olympiad.participant_pdf_key)
        except Exception:
            raise http_error(503, codes.STORAGE_UNAVAILABLE, message="Не удалось прочитать PDF из хранилища.")
        return StreamingResponse(iter_pdf(stored["Body"]), background=BackgroundTask(stored["Body"].close), media_type="application/pdf", headers={
            "Content-Disposition": f'attachment; filename="olympiad_{olympiad_id}_participant.pdf"',
            "Content-Length": str(stored["ContentLength"]),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        })
