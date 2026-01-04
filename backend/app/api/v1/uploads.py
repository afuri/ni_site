from fastapi import APIRouter, Depends

from app.core.deps_auth import require_admin_or_moderator, get_current_user
import re

from app.core.errors import http_error
from app.core.storage import presign_get, presign_put, presign_post
from app.core.config import settings
from app.schemas.uploads import (
    UploadPresignRequest,
    UploadPresignResponse,
    UploadPresignPostResponse,
    UploadGetResponse,
)


router = APIRouter(prefix="/uploads")

ALLOWED_PREFIXES = ("tasks", "content")
PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9/_-]*$")
MAX_PREFIX_SEGMENTS = 3


def _normalize_prefix(prefix: str) -> str:
    normalized = prefix.strip().strip("/")
    normalized = "/".join(part for part in normalized.split("/") if part)
    return normalized


@router.post(
    "/presign",
    response_model=UploadPresignResponse,
    tags=["uploads"],
    description="Получить ссылку для загрузки изображения в хранилище",
)
async def presign_upload(
    payload: UploadPresignRequest,
    user=Depends(require_admin_or_moderator()),
):
    normalized = _normalize_prefix(payload.prefix)
    if normalized in ("", ".", "..") or ".." in normalized.split("/"):
        raise http_error(422, "invalid_prefix")
    if not any(normalized == allowed or normalized.startswith(f"{allowed}/") for allowed in ALLOWED_PREFIXES):
        raise http_error(422, "invalid_prefix")
    if not PREFIX_RE.match(normalized):
        raise http_error(422, "invalid_prefix")
    if len(normalized.split("/")) > MAX_PREFIX_SEGMENTS:
        raise http_error(422, "invalid_prefix")
    try:
        result = presign_put(prefix=normalized, content_type=payload.content_type)
    except ValueError:
        raise http_error(422, "content_type_not_allowed")
    except RuntimeError:
        raise http_error(503, "storage_unavailable")
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
)
async def presign_upload_post(
    payload: UploadPresignRequest,
    user=Depends(require_admin_or_moderator()),
):
    normalized = _normalize_prefix(payload.prefix)
    if normalized in ("", ".", "..") or ".." in normalized.split("/"):
        raise http_error(422, "invalid_prefix")
    if not any(normalized == allowed or normalized.startswith(f"{allowed}/") for allowed in ALLOWED_PREFIXES):
        raise http_error(422, "invalid_prefix")
    if not PREFIX_RE.match(normalized):
        raise http_error(422, "invalid_prefix")
    if len(normalized.split("/")) > MAX_PREFIX_SEGMENTS:
        raise http_error(422, "invalid_prefix")
    try:
        result = presign_post(
            prefix=normalized,
            content_type=payload.content_type,
            max_size_bytes=settings.STORAGE_MAX_UPLOAD_MB * 1024 * 1024,
        )
    except ValueError:
        raise http_error(422, "content_type_not_allowed")
    except RuntimeError:
        raise http_error(503, "storage_unavailable")
    return UploadPresignPostResponse(
        key=result.key,
        upload_url=result.upload_url,
        fields=result.fields,
        public_url=result.public_url,
        expires_in=result.expires_in,
        max_size_bytes=result.max_size_bytes,
    )


@router.get(
    "/{key:path}",
    response_model=UploadGetResponse,
    tags=["uploads"],
    description="Получить временную ссылку на файл из хранилища",
)
async def get_upload_url(
    key: str,
    user=Depends(get_current_user),
):
    try:
        url = presign_get(key=key)
    except RuntimeError:
        raise http_error(503, "storage_unavailable")
    return UploadGetResponse(url=url, expires_in=settings.STORAGE_PRESIGN_EXPIRES_SEC)
