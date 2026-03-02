from __future__ import annotations

import uuid
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlparse

import boto3
from botocore.client import Config

from app.core.config import settings
from app.core import error_codes as codes


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
    endpoint = _resolve_working_storage_endpoint()
    if not endpoint or not settings.STORAGE_ACCESS_KEY or not settings.STORAGE_SECRET_KEY:
        return None
    scheme = urlparse(endpoint).scheme.lower()
    use_ssl = scheme == "https" if scheme in {"http", "https"} else settings.STORAGE_USE_SSL
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.STORAGE_ACCESS_KEY,
        aws_secret_access_key=settings.STORAGE_SECRET_KEY,
        region_name=settings.STORAGE_REGION,
        use_ssl=use_ssl,
        config=Config(signature_version="s3v4"),
    )


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
            config=Config(signature_version="s3v4"),
        )
        try:
            client.head_bucket(Bucket=settings.STORAGE_BUCKET)
            return endpoint
        except Exception:
            continue
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
    client = _get_s3_client()
    if client is None:
        raise RuntimeError("storage_not_configured")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(codes.CONTENT_TYPE_NOT_ALLOWED)

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
        raise ValueError(codes.CONTENT_TYPE_NOT_ALLOWED)

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
