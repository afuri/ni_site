from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, TypeVar
from urllib.parse import urlparse

import boto3
from anyio import CapacityLimiter, to_thread
from botocore.client import Config

from app.core.config import settings
from app.core import error_codes as codes

T = TypeVar("T")
logger = logging.getLogger(__name__)
_io_limiter: CapacityLimiter | None = None
_client_lock = threading.Lock()
_client: Any = None
_client_signature: tuple[Any, ...] | None = None
_client_retry_at = 0.0


async def storage_work(function: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Keep synchronous storage I/O outside the API event loop."""
    global _io_limiter
    if _io_limiter is None:
        _io_limiter = CapacityLimiter(4)
    started = time.monotonic()
    try:
        return await to_thread.run_sync(lambda: function(*args, **kwargs), limiter=_io_limiter)
    finally:
        elapsed = time.monotonic() - started
        if elapsed >= 1:
            logger.info("storage_work_slow operation=%s elapsed_ms=%d",
                        getattr(function, "__name__", "storage"), elapsed * 1000)


def _client_config(*, probe: bool = False) -> Config:
    return Config(signature_version="s3v4", connect_timeout=2, read_timeout=5,
                  retries={"mode": "standard", "total_max_attempts": 1 if probe else 2},
                  max_pool_connections=8)


def _reset_after_fork() -> None:
    global _client_lock, _client, _client_signature, _client_retry_at, _io_limiter
    _client_lock = threading.Lock()
    _client = None
    _client_signature = None
    _client_retry_at = 0
    _io_limiter = None


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_reset_after_fork)


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


def _get_s3_client() -> Any:
    global _client, _client_signature, _client_retry_at
    if not settings.STORAGE_ACCESS_KEY or not settings.STORAGE_SECRET_KEY:
        return None
    # A prefork Celery child must never reuse its parent's connection pool.
    signature = (os.getpid(), settings.STORAGE_ENDPOINT, settings.STORAGE_BUCKET,
                 settings.STORAGE_ACCESS_KEY, settings.STORAGE_SECRET_KEY,
                 settings.STORAGE_REGION, settings.STORAGE_USE_SSL)
    with _client_lock:
        if signature == _client_signature:
            if _client is not None:
                return _client
            if time.monotonic() < _client_retry_at:
                return None
        _client_signature = signature
        _client = None
        _resolve_working_storage_endpoint.cache_clear()
        endpoint = _resolve_working_storage_endpoint()
        if not endpoint:
            # Coalesce failures, but recover after a temporary storage outage.
            _client_retry_at = time.monotonic() + 5
            return None
        scheme = urlparse(endpoint).scheme.lower()
        use_ssl = scheme == "https" if scheme in {"http", "https"} else settings.STORAGE_USE_SSL
        _client = boto3.client(
            "s3", endpoint_url=endpoint,
            aws_access_key_id=settings.STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.STORAGE_SECRET_KEY,
            region_name=settings.STORAGE_REGION, use_ssl=use_ssl,
            config=_client_config(),
        )
        return _client


def _endpoint_candidates() -> list[str]:
    candidates: list[str] = []
    configured = (settings.STORAGE_ENDPOINT or "").strip()
    if configured:
        candidates.append(configured)
        parsed = urlparse(configured)
        host = (parsed.hostname or "").lower()
        scheme = (parsed.scheme or ("https" if settings.STORAGE_USE_SSL else "http")).lower()
        alt_scheme = "http" if scheme == "https" else "https"
        port = parsed.port or (443 if scheme == "https" else 80)
        if host not in {"minio", "localhost", "127.0.0.1"}:
            candidates.extend(
                [
                    f"{scheme}://minio:9000",
                    f"http://minio:9000",
                    f"https://minio:9000",
                    f"{scheme}://127.0.0.1:{port}",
                    f"{alt_scheme}://127.0.0.1:{port}",
                    f"{scheme}://localhost:{port}",
                    f"{alt_scheme}://localhost:{port}",
                ]
            )
        else:
            candidates.extend(
                [
                    f"{alt_scheme}://{host}:{port}",
                    "http://minio:9000",
                    "https://minio:9000",
                ]
            )
    else:
        candidates.extend(["http://minio:9000", "https://minio:9000"])

    unique: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique.append(candidate)
    return unique


@lru_cache(maxsize=1)
def _resolve_working_storage_endpoint() -> str | None:
    if not settings.STORAGE_ACCESS_KEY or not settings.STORAGE_SECRET_KEY:
        return None
    for endpoint in _endpoint_candidates():
        scheme = urlparse(endpoint).scheme.lower()
        use_ssl = scheme == "https" if scheme in {"http", "https"} else settings.STORAGE_USE_SSL
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.STORAGE_SECRET_KEY,
            region_name=settings.STORAGE_REGION,
            use_ssl=use_ssl,
            config=_client_config(probe=True),
        )
        try:
            client.head_bucket(Bucket=settings.STORAGE_BUCKET)
            return endpoint
        except Exception:
            continue
        finally:
            client.close()
    return None


def _build_key(prefix: str, content_type: str) -> str:
    ext = CONTENT_TYPE_EXT.get(content_type, "bin")
    return f"{prefix}/{uuid.uuid4().hex}.{ext}"


def _public_url_for_key(key: str) -> str | None:
    if not settings.STORAGE_PUBLIC_BASE_URL:
        return None
    base = settings.STORAGE_PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/{key}"


def public_url_for_key(key: str) -> str | None:
    return _public_url_for_key(key)


def presign_put(prefix: str, content_type: str) -> PresignPutResult:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(codes.CONTENT_TYPE_NOT_ALLOWED)
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")

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
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(codes.CONTENT_TYPE_NOT_ALLOWED)
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")

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


def storage_health() -> bool:
    client = _get_s3_client()
    if client is None:
        return False
    try:
        client.head_bucket(Bucket=settings.STORAGE_BUCKET)
        return True
    except Exception:
        return False


def list_object_keys(prefix: str) -> list[str]:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    keys: list[str] = []
    token: str | None = None
    while True:
        params = {
            "Bucket": settings.STORAGE_BUCKET,
            "Prefix": prefix,
            "MaxKeys": 1000,
        }
        if token:
            params["ContinuationToken"] = token
        response = client.list_objects_v2(**params)
        contents = response.get("Contents") or []
        for item in contents:
            key = item.get("Key")
            if isinstance(key, str):
                keys.append(key)
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
        if not token:
            break
    return keys


def put_object(key: str, data: bytes, content_type: str) -> None:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    client.put_object(Bucket=settings.STORAGE_BUCKET, Key=key, Body=data, ContentType=content_type)


def delete_object(key: str) -> None:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    client.delete_object(Bucket=settings.STORAGE_BUCKET, Key=key)


def old_import_image_keys(cutoff) -> list[str]:
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    keys = []
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=settings.STORAGE_BUCKET, Prefix="tasks/imports/"):
        keys.extend(obj["Key"] for obj in page.get("Contents", []) if obj["LastModified"] < cutoff)
    return keys
