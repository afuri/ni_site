from __future__ import annotations

import uuid
from dataclasses import dataclass

import boto3
from botocore.client import Config

from app.core.config import settings


ALLOWED_CONTENT_TYPES = {t.strip() for t in settings.STORAGE_ALLOWED_CONTENT_TYPES.split(",") if t.strip()}
CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


@dataclass(slots=True)
class PresignPutResult:
    key: str
    upload_url: str
    headers: dict[str, str]
    public_url: str | None
    expires_in: int


@dataclass(slots=True)
class PresignPostResult:
    key: str
    upload_url: str
    fields: dict[str, str]
    public_url: str | None
    expires_in: int
    max_size_bytes: int


def _get_s3_client():
    if not settings.STORAGE_ENDPOINT or not settings.STORAGE_ACCESS_KEY or not settings.STORAGE_SECRET_KEY:
        return None
    return boto3.client(
        "s3",
        endpoint_url=settings.STORAGE_ENDPOINT,
        aws_access_key_id=settings.STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.STORAGE_SECRET_KEY,
        region_name=settings.STORAGE_REGION,
        use_ssl=settings.STORAGE_USE_SSL,
        config=Config(signature_version="s3v4"),
    )


def _build_key(prefix: str, content_type: str) -> str:
    ext = CONTENT_TYPE_EXT.get(content_type, "bin")
    return f"{prefix}/{uuid.uuid4().hex}.{ext}"


def _public_url_for_key(key: str) -> str | None:
    if not settings.STORAGE_PUBLIC_BASE_URL:
        return None
    base = settings.STORAGE_PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/{key}"


def presign_put(prefix: str, content_type: str) -> PresignPutResult:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("content_type_not_allowed")

    key = _build_key(prefix, content_type)
    params = {
        "Bucket": settings.STORAGE_BUCKET,
        "Key": key,
        "ContentType": content_type,
    }
    upload_url = client.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=settings.STORAGE_PRESIGN_EXPIRES_SEC,
    )
    return PresignPutResult(
        key=key,
        upload_url=upload_url,
        headers={"Content-Type": content_type},
        public_url=_public_url_for_key(key),
        expires_in=settings.STORAGE_PRESIGN_EXPIRES_SEC,
    )


def presign_post(prefix: str, content_type: str, max_size_bytes: int) -> PresignPostResult:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("content_type_not_allowed")

    key = _build_key(prefix, content_type)
    conditions = [
        {"Content-Type": content_type},
        ["content-length-range", 1, max_size_bytes],
    ]
    fields = {"Content-Type": content_type}

    response = client.generate_presigned_post(
        Bucket=settings.STORAGE_BUCKET,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=settings.STORAGE_PRESIGN_EXPIRES_SEC,
    )

    return PresignPostResult(
        key=key,
        upload_url=response["url"],
        fields=response["fields"],
        public_url=_public_url_for_key(key),
        expires_in=settings.STORAGE_PRESIGN_EXPIRES_SEC,
        max_size_bytes=max_size_bytes,
    )


def presign_get(key: str) -> str:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.STORAGE_BUCKET, "Key": key},
        ExpiresIn=settings.STORAGE_PRESIGN_EXPIRES_SEC,
    )
