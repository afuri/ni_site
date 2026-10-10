from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import OperationalError, TimeoutError as PoolTimeoutError
from fastapi.security import HTTPAuthorizationCredentials
import logging

from app.core.deps_auth import require_admin_or_moderator, get_current_user, bearer_scheme
from app.core.deps import get_db
import re

from app.core.errors import http_error
from app.core.storage import presign_get, presign_put, presign_post, public_url_for_key, storage_work
from app.core.config import settings
from app.core import error_codes as codes
from app.models.content import ContentItem, ContentStatus
from app.models.olympiad import Olympiad
from app.models.olympiad_task import OlympiadTask
from app.models.task import Task
from app.models.user import User, UserRole
from app.models.attempt import Attempt, AttemptStatus
from app.schemas.uploads import (
    UploadPresignRequest,
    UploadPresignResponse,
    UploadPresignPostResponse,
    UploadGetResponse,
    TaskImageUploadResponse,
)
from app.services.task_images import TaskImageError, image_work, upload_task_image
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import (
    EXAMPLE_UPLOAD_GET,
    EXAMPLE_UPLOAD_PRESIGN,
    EXAMPLE_UPLOAD_PRESIGN_POST,
    response_model_example,
)


router = APIRouter(prefix="/uploads")
logger = logging.getLogger(__name__)


def _database_unavailable(exc: Exception) -> HTTPException:
    logger.warning("upload_database_unavailable reason=%s", type(exc).__name__)
    return http_error(503, codes.DATABASE_UNAVAILABLE,
                      "Сервис временно недоступен. Повторите запрос.")


async def _get_upload_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        return await get_current_user(creds, db)
    except (TimeoutError, PoolTimeoutError, OperationalError) as exc:
        raise _database_unavailable(exc) from exc


ALLOWED_PREFIXES = ("tasks", "content")
PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9/_-]*$")
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/_. -]*$")
MAX_PREFIX_SEGMENTS = 3


def _normalize_prefix(prefix: str) -> str:
    normalized = prefix.strip().strip("/")
    normalized = "/".join(part for part in normalized.split("/") if part)
    return normalized


def _normalize_key(key: str) -> str:
    return key.strip().strip("/")


def _validate_key(key: str) -> str:
    normalized = _normalize_key(key)
    if normalized in ("", ".", ".."):
        raise http_error(422, codes.INVALID_PREFIX)
    segments = normalized.split("/")
    if any(not segment for segment in segments):
        raise http_error(422, codes.INVALID_PREFIX)
    if any(segment in (".", "..") for segment in segments):
        raise http_error(422, codes.INVALID_PREFIX)
    if not KEY_RE.match(normalized):
        raise http_error(422, codes.INVALID_PREFIX)
    if segments[0] not in ALLOWED_PREFIXES:
        raise http_error(422, codes.INVALID_PREFIX)
    return normalized


def _is_admin_or_moderator(user) -> bool:
    if user.role == UserRole.admin:
        return True
    return user.role == UserRole.teacher and user.is_moderator


async def _task_image_access(db: AsyncSession, key: str, *, allow_unpublished: bool, student_id: int | None = None) -> bool:
    stmt = select(Task.id).where(Task.image_key == key)
    if not allow_unpublished:
        own_completed = select(Attempt.id).where(
            Attempt.olympiad_id == Olympiad.id,
            Attempt.user_id == student_id,
            or_(Attempt.status == AttemptStatus.active,
                Olympiad.results_released.is_(True)),
        ).correlate(Olympiad).exists() if student_id is not None else False
        stmt = (
            stmt.join(OlympiadTask, OlympiadTask.task_id == Task.id)
            .join(Olympiad, Olympiad.id == OlympiadTask.olympiad_id)
            .where(or_(Olympiad.is_published.is_(True), own_completed))
        )
    res = await db.execute(stmt.limit(1))
    return res.scalar_one_or_none() is not None


async def _content_image_access(db: AsyncSession, key: str, *, allow_unpublished: bool) -> bool:
    stmt = select(ContentItem.id).where(ContentItem.image_keys.contains([key]))
    if not allow_unpublished:
        stmt = stmt.where(ContentItem.status == ContentStatus.published)
    res = await db.execute(stmt.limit(1))
    return res.scalar_one_or_none() is not None


@router.post(
    "/presign",
    response_model=UploadPresignResponse,
    tags=["uploads"],
    description="Получить ссылку для загрузки изображения в хранилище",
    responses={
        200: response_model_example(UploadPresignResponse, EXAMPLE_UPLOAD_PRESIGN),
        401: response_example(codes.MISSING_TOKEN),
        422: response_examples(codes.INVALID_PREFIX, codes.CONTENT_TYPE_NOT_ALLOWED),
        503: response_example(codes.STORAGE_UNAVAILABLE),
    },
)
async def presign_upload(
    payload: UploadPresignRequest,
    user=Depends(require_admin_or_moderator()),
):
    normalized = _normalize_prefix(payload.prefix)
    if normalized in ("", ".", "..") or ".." in normalized.split("/"):
        raise http_error(422, codes.INVALID_PREFIX)
    if not any(normalized == allowed or normalized.startswith(f"{allowed}/") for allowed in ALLOWED_PREFIXES):
        raise http_error(422, codes.INVALID_PREFIX)
    if not PREFIX_RE.match(normalized):
        raise http_error(422, codes.INVALID_PREFIX)
    if len(normalized.split("/")) > MAX_PREFIX_SEGMENTS:
        raise http_error(422, codes.INVALID_PREFIX)
    try:
        result = await storage_work(presign_put, prefix=normalized, content_type=payload.content_type)
    except ValueError:
        raise http_error(422, codes.CONTENT_TYPE_NOT_ALLOWED)
    except RuntimeError:
        raise http_error(503, codes.STORAGE_UNAVAILABLE)
    return UploadPresignResponse(
        key=result.key,
        upload_url=result.upload_url,
        headers=result.headers,
        public_url=result.public_url,
        expires_in=result.expires_in,
    )


@router.post(
    "/presign-post",
    response_model=UploadPresignPostResponse,
    tags=["uploads"],
    description="Получить форму для загрузки с лимитом размера",
    responses={
        200: response_model_example(UploadPresignPostResponse, EXAMPLE_UPLOAD_PRESIGN_POST),
        401: response_example(codes.MISSING_TOKEN),
        422: response_examples(codes.INVALID_PREFIX, codes.CONTENT_TYPE_NOT_ALLOWED),
        503: response_example(codes.STORAGE_UNAVAILABLE),
    },
)
async def presign_upload_post(
    payload: UploadPresignRequest,
    user=Depends(require_admin_or_moderator()),
):
    normalized = _normalize_prefix(payload.prefix)
    if normalized in ("", ".", "..") or ".." in normalized.split("/"):
        raise http_error(422, codes.INVALID_PREFIX)
    if not any(normalized == allowed or normalized.startswith(f"{allowed}/") for allowed in ALLOWED_PREFIXES):
        raise http_error(422, codes.INVALID_PREFIX)
    if not PREFIX_RE.match(normalized):
        raise http_error(422, codes.INVALID_PREFIX)
    if len(normalized.split("/")) > MAX_PREFIX_SEGMENTS:
        raise http_error(422, codes.INVALID_PREFIX)
    try:
        result = await storage_work(presign_post,
            prefix=normalized,
            content_type=payload.content_type,
            max_size_bytes=settings.STORAGE_MAX_UPLOAD_MB * 1024 * 1024,
        )
    except ValueError:
        raise http_error(422, codes.CONTENT_TYPE_NOT_ALLOWED)
    except RuntimeError:
        raise http_error(503, codes.STORAGE_UNAVAILABLE)
    return UploadPresignPostResponse(
        key=result.key,
        upload_url=result.upload_url,
        fields=result.fields,
        public_url=result.public_url,
        expires_in=result.expires_in,
        max_size_bytes=result.max_size_bytes,
    )


@router.post(
    "/task-image", response_model=TaskImageUploadResponse, tags=["uploads"],
    description="Проверить и уменьшить изображение задания общей с ZIP функцией, затем сохранить в bucket",
    responses={401: {"description": "Необходима авторизация"},
               403: {"description": "Доступ только администратору или модератору"},
               413: {"description": "Изображение превышает допустимый размер"},
               422: {"description": "Некорректное изображение или ширина"},
               503: {"description": "Хранилище недоступно"}},
)
async def upload_image(image: UploadFile = File(...), width: str = Form("original"),
                       user=Depends(require_admin_or_moderator()), db: AsyncSession = Depends(get_db)):
    limit = settings.STORAGE_MAX_UPLOAD_MB * 1024 * 1024
    try:
        raw = await image.read(limit + 1)
    finally:
        await image.close()
    if len(raw) > limit:
        raise http_error(413, "task_image_too_large", "Изображение превышает допустимый размер.")
    if width != "original" and not re.fullmatch(r"[1-9]\d{0,3}", width):
        raise http_error(422, "task_image_invalid", "Недопустимая ширина изображения.")
    await db.commit()
    try:
        return await image_work(upload_task_image, raw, image.filename or "", int(width) if width != "original" else width)
    except TaskImageError as exc:
        raise http_error(422, "task_image_invalid", str(exc)) from exc
    except Exception as exc:
        raise http_error(503, "storage_unavailable", "Не удалось сохранить изображение в хранилище. Повторите загрузку.") from exc


@router.get(
    "/{key:path}",
    response_model=UploadGetResponse,
    tags=["uploads"],
    description="Получить временную ссылку на файл из хранилища",
    responses={
        200: response_model_example(UploadGetResponse, EXAMPLE_UPLOAD_GET),
        401: response_example(codes.MISSING_TOKEN),
        503: response_examples(codes.STORAGE_UNAVAILABLE, codes.DATABASE_UNAVAILABLE),
    },
)
async def get_upload_url(
    key: str,
    user=Depends(_get_upload_user),
    db: AsyncSession = Depends(get_db),
):
    normalized = _validate_key(key)
    allow_unpublished = _is_admin_or_moderator(user)
    prefix = normalized.split("/", 1)[0]
    try:
        if prefix == "tasks":
            allowed = await _task_image_access(db, normalized, allow_unpublished=allow_unpublished,
                                              student_id=user.id if user.role == UserRole.student else None)
            if not allowed:
                raise http_error(404, codes.TASK_NOT_FOUND)
        elif prefix == "content":
            allowed = await _content_image_access(db, normalized, allow_unpublished=allow_unpublished)
            if not allowed:
                raise http_error(404, codes.CONTENT_NOT_FOUND)
        # Release the read-only transaction before waiting for storage I/O.
        await db.rollback()
    except (TimeoutError, PoolTimeoutError, OperationalError) as exc:
        raise _database_unavailable(exc) from exc
    try:
        url = await storage_work(presign_get, key=normalized)
    except Exception:
        raise http_error(503, codes.STORAGE_UNAVAILABLE)
    public_url = public_url_for_key(normalized)
    return UploadGetResponse(url=url, public_url=public_url, expires_in=settings.STORAGE_PRESIGN_EXPIRES_SEC)
