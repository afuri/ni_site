#!/usr/bin/env python3
"""Bulk upload attempt_<id>.jpg diplomas to S3/MinIO bucket root."""

from __future__ import annotations

import csv
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit, urlunsplit

try:
    import boto3
except ImportError as exc:
    raise SystemExit("boto3 is required: python3 -m pip install boto3") from exc

from botocore.client import Config
from botocore.exceptions import ClientError


ATTEMPT_FILE_RE = re.compile(r"^attempt_(\d+)\.jpe?g$", re.IGNORECASE)


@dataclass(slots=True)
class UploadRow:
    attempt_id: int
    source_path: str
    key: str
    status: str
    message: str = ""


def _to_bool(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _read_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            result[key] = value
    return result


def _env_value(env_file: dict[str, str], key: str, default: str | None = None) -> str | None:
    return os.environ.get(key) or env_file.get(key) or default


def _scan_source(source_dir: Path) -> tuple[dict[int, Path], list[UploadRow]]:
    found: dict[int, Path] = {}
    rows: list[UploadRow] = []

    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        match = ATTEMPT_FILE_RE.match(path.name)
        if not match:
            continue
        attempt_id = int(match.group(1))
        key = f"attempt_{attempt_id}.jpg"
        if attempt_id in found:
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=str(path),
                    key=key,
                    status="skipped_duplicate",
                    message=f"duplicate of {found[attempt_id]}",
                )
            )
            continue
        found[attempt_id] = path
    return found, rows


def _fetch_existing_attempt_ids(db_service: str, db_user: str, db_name: str) -> set[int]:
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        db_service,
        "psql",
        "-U",
        db_user,
        "-d",
        db_name,
        "-Atc",
        "SELECT id FROM attempts;",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "Failed to read attempts from DB.\n"
            f"Command: {' '.join(cmd)}\n"
            f"stderr: {proc.stderr.strip()}"
        )
    ids: set[int] = set()
    for line in proc.stdout.splitlines():
        raw = line.strip()
        if not raw:
            continue
        try:
            ids.add(int(raw))
        except ValueError:
            continue
    return ids


def _endpoint_candidates(endpoint: str) -> Iterable[str]:
    yield endpoint
    parsed = urlsplit(endpoint)
    host = parsed.hostname or ""
    if host != "minio":
        return
    for replacement in ("127.0.0.1", "localhost"):
        netloc = replacement
        if parsed.port:
            netloc = f"{replacement}:{parsed.port}"
        yield urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


def _build_s3_client(
    *,
    endpoint: str,
    access_key: str,
    secret_key: str,
    region: str,
    use_ssl: bool,
):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        use_ssl=use_ssl,
        config=Config(signature_version="s3v4"),
    )


def _resolve_working_client(
    *,
    endpoint: str,
    access_key: str,
    secret_key: str,
    region: str,
    use_ssl: bool,
    bucket: str,
):
    last_error: str = ""
    for candidate in _endpoint_candidates(endpoint):
        client = _build_s3_client(
            endpoint=candidate,
            access_key=access_key,
            secret_key=secret_key,
            region=region,
            use_ssl=use_ssl,
        )
        try:
            client.head_bucket(Bucket=bucket)
            return client, candidate
        except Exception as exc:  # pragma: no cover - runtime/network dependent
            last_error = str(exc)
            continue
    raise RuntimeError(
        "Could not connect to storage bucket.\n"
        f"Configured endpoint: {endpoint}\n"
        f"Last error: {last_error}"
    )


def _object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _write_report(rows: list[UploadRow], report_path: Path) -> None:
    with report_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["attempt_id", "source_path", "key", "status", "message"])
        for row in rows:
            writer.writerow([row.attempt_id, row.source_path, row.key, row.status, row.message])


def main() -> int:
    project_dir = Path.cwd()
    env_file = _read_dotenv(project_dir / os.environ.get("DOTENV_PATH", ".env"))

    source_dir_raw = _env_value(env_file, "SOURCE_DIR", ".")
    source_dir = Path(source_dir_raw).expanduser().resolve()
    dry_run = _to_bool(_env_value(env_file, "DRY_RUN", "0"))
    overwrite = _to_bool(_env_value(env_file, "OVERWRITE", "0"))

    db_service = _env_value(env_file, "DB_SERVICE", "db") or "db"
    db_user = _env_value(env_file, "DB_USER", "postgres") or "postgres"
    db_name = _env_value(env_file, "DB_NAME", "ni_site") or "ni_site"

    storage_endpoint = _env_value(env_file, "STORAGE_ENDPOINT")
    storage_bucket = _env_value(env_file, "STORAGE_BUCKET")
    storage_access_key = _env_value(env_file, "STORAGE_ACCESS_KEY")
    storage_secret_key = _env_value(env_file, "STORAGE_SECRET_KEY")
    storage_region = _env_value(env_file, "STORAGE_REGION", "us-east-1") or "us-east-1"
    storage_use_ssl = _to_bool(_env_value(env_file, "STORAGE_USE_SSL", "false"))

    if not source_dir.exists() or not source_dir.is_dir():
        print(f"ERROR: source directory not found: {source_dir}", file=sys.stderr)
        return 2

    missing_storage = [
        name
        for name, value in (
            ("STORAGE_ENDPOINT", storage_endpoint),
            ("STORAGE_BUCKET", storage_bucket),
            ("STORAGE_ACCESS_KEY", storage_access_key),
            ("STORAGE_SECRET_KEY", storage_secret_key),
        )
        if not value
    ]
    if missing_storage:
        print(f"ERROR: missing storage settings: {', '.join(missing_storage)}", file=sys.stderr)
        return 2

    print(f"Source directory: {source_dir}")
    print(f"Dry run: {'yes' if dry_run else 'no'}")
    print(f"Overwrite existing objects: {'yes' if overwrite else 'no'}")

    files_by_attempt, rows = _scan_source(source_dir)
    if not files_by_attempt:
        print("No files found by pattern attempt_<id>.jpg")
        return 0

    print(f"Found files: {len(files_by_attempt)}")
    if rows:
        print(f"Skipped duplicates: {sum(1 for r in rows if r.status == 'skipped_duplicate')}")

    attempt_ids_in_db = _fetch_existing_attempt_ids(db_service=db_service, db_user=db_user, db_name=db_name)
    print(f"Attempts in DB: {len(attempt_ids_in_db)}")

    client = None
    endpoint_used = ""
    if not dry_run:
        client, endpoint_used = _resolve_working_client(
            endpoint=storage_endpoint or "",
            access_key=storage_access_key or "",
            secret_key=storage_secret_key or "",
            region=storage_region,
            use_ssl=storage_use_ssl,
            bucket=storage_bucket or "",
        )
        print(f"Storage endpoint used: {endpoint_used}")

    total = len(files_by_attempt)
    index = 0
    for attempt_id, source_path in sorted(files_by_attempt.items(), key=lambda item: item[0]):
        index += 1
        key = f"attempt_{attempt_id}.jpg"
        source_path_str = str(source_path)

        if attempt_id not in attempt_ids_in_db:
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=source_path_str,
                    key=key,
                    status="skipped_missing_attempt",
                    message="attempt id not found in DB",
                )
            )
            continue

        if dry_run:
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=source_path_str,
                    key=key,
                    status="would_upload",
                )
            )
            continue

        assert client is not None
        if not overwrite and _object_exists(client, storage_bucket or "", key):
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=source_path_str,
                    key=key,
                    status="skipped_exists",
                )
            )
            continue

        try:
            client.upload_file(
                Filename=source_path_str,
                Bucket=storage_bucket or "",
                Key=key,
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=source_path_str,
                    key=key,
                    status="uploaded",
                )
            )
        except Exception as exc:  # pragma: no cover - runtime/network dependent
            rows.append(
                UploadRow(
                    attempt_id=attempt_id,
                    source_path=source_path_str,
                    key=key,
                    status="error",
                    message=str(exc),
                )
            )

        if index % 200 == 0:
            print(f"Processed {index}/{total} files...")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_path = project_dir / f"diploma_upload_report_{ts}.csv"
    _write_report(rows, report_path)

    counters: dict[str, int] = {}
    for row in rows:
        counters[row.status] = counters.get(row.status, 0) + 1

    print("Summary:")
    for status_name in sorted(counters):
        print(f"  {status_name}: {counters[status_name]}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
