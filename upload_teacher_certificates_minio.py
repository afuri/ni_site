#!/usr/bin/env python3
"""Bulk upload teacher certificates to S3/MinIO.

Expected source file name:
  certificate_<user_id>_<YYYY>_<YYYY+1>_<seq>.jpg

Uploaded key format:
  certificates/teachers/<YYYY>_<YYYY+1>/certificate_<user_id>_<YYYY>_<YYYY+1>_<seq>.jpg
"""

from __future__ import annotations

import csv
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

try:
    import boto3
except ImportError as exc:
    raise SystemExit("boto3 is required: install it first (python3 -m pip install boto3)") from exc

from botocore.client import Config
from botocore.exceptions import ClientError


CERT_FILE_RE = re.compile(
    r"^certificate_(?P<user_id>\d+)_(?P<y1>\d{4})_(?P<y2>\d{4})_(?P<seq>\d{2})\.jpg$",
    re.IGNORECASE,
)
KEY_PREFIX = "certificates/teachers"


@dataclass(slots=True)
class CandidateFile:
    user_id: int
    season: str
    seq: int
    file_name: str
    source_path: Path
    key: str


@dataclass(slots=True)
class ReportRow:
    file_name: str
    source_path: str
    key: str
    user_id: str
    season: str
    seq: str
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


def _env(env_file: dict[str, str], key: str, default: str | None = None) -> str | None:
    return os.environ.get(key) or env_file.get(key) or default


def _parse_file(path: Path) -> CandidateFile | None:
    match = CERT_FILE_RE.match(path.name)
    if not match:
        return None

    user_id = int(match.group("user_id"))
    y1 = int(match.group("y1"))
    y2 = int(match.group("y2"))
    if y2 != y1 + 1:
        return None

    seq = int(match.group("seq"))
    season = f"{y1}_{y2}"
    key = f"{KEY_PREFIX}/{season}/{path.name}"
    return CandidateFile(
        user_id=user_id,
        season=season,
        seq=seq,
        file_name=path.name,
        source_path=path,
        key=key,
    )


def _scan_source(source_dir: Path) -> tuple[list[CandidateFile], list[ReportRow]]:
    items: list[CandidateFile] = []
    report: list[ReportRow] = []
    seen_keys: set[str] = set()

    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        parsed = _parse_file(path)
        if parsed is None:
            report.append(
                ReportRow(
                    file_name=path.name,
                    source_path=str(path),
                    key="",
                    user_id="",
                    season="",
                    seq="",
                    status="skipped_invalid_name",
                    message="expected certificate_<user_id>_<YYYY>_<YYYY+1>_<seq>.jpg",
                )
            )
            continue
        if parsed.key in seen_keys:
            report.append(
                ReportRow(
                    file_name=parsed.file_name,
                    source_path=str(parsed.source_path),
                    key=parsed.key,
                    user_id=str(parsed.user_id),
                    season=parsed.season,
                    seq=f"{parsed.seq:02d}",
                    status="skipped_duplicate_key",
                    message="another file with same target key already scanned",
                )
            )
            continue
        seen_keys.add(parsed.key)
        items.append(parsed)
    return items, report


def _run_sql(db_service: str, db_user: str, db_name: str, sql: str) -> set[int]:
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
        sql,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "Failed to query DB.\n"
            f"Command: {' '.join(cmd)}\n"
            f"stderr: {proc.stderr.strip()}"
        )
    result: set[int] = set()
    for line in proc.stdout.splitlines():
        raw = line.strip()
        if not raw:
            continue
        try:
            result.add(int(raw))
        except ValueError:
            continue
    return result


def _load_teacher_ids(db_service: str, db_user: str, db_name: str) -> set[int]:
    return _run_sql(db_service, db_user, db_name, "SELECT id FROM users WHERE role = 'teacher';")


def _build_client(endpoint: str, access_key: str, secret_key: str, region: str, use_ssl: bool):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        use_ssl=use_ssl,
        config=Config(signature_version="s3v4"),
    )


def _endpoint_candidates(configured_endpoint: str | None, use_ssl: bool, override: str | None) -> list[str]:
    candidates: list[str] = []

    if override:
        candidates.append(override)

    if configured_endpoint:
        candidates.append(configured_endpoint)
        parsed = urlparse(configured_endpoint)
        host = (parsed.hostname or "").lower()
        scheme = (parsed.scheme or ("https" if use_ssl else "http")).lower()
        alt_scheme = "http" if scheme == "https" else "https"
        port = parsed.port or (443 if scheme == "https" else 80)
        if host not in {"127.0.0.1", "localhost", "minio"}:
            candidates.extend(
                [
                    f"{scheme}://127.0.0.1:{port}",
                    f"{scheme}://localhost:{port}",
                    f"{alt_scheme}://127.0.0.1:{port}",
                    f"{alt_scheme}://localhost:{port}",
                ]
            )
        else:
            candidates.append(f"{alt_scheme}://{host}:{port}")

    candidates.extend(
        [
            "http://127.0.0.1:9000",
            "http://localhost:9000",
            "http://minio:9000",
            "https://127.0.0.1:9000",
            "https://localhost:9000",
            "https://minio:9000",
        ]
    )

    unique: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    return unique


def _probe_client(client, bucket: str) -> None:
    client.head_bucket(Bucket=bucket)
    client.list_objects_v2(Bucket=bucket, MaxKeys=1)


def _resolve_clients(
    endpoint: str | None,
    bucket: str,
    access_key: str,
    secret_key: str,
    region: str,
    use_ssl: bool,
    override: str | None,
) -> list[tuple[object, str]]:
    errors: list[str] = []
    working: list[tuple[object, str]] = []

    for candidate in _endpoint_candidates(endpoint, use_ssl, override):
        try:
            scheme = urlparse(candidate).scheme.lower()
            candidate_use_ssl = scheme == "https"
            client = _build_client(candidate, access_key, secret_key, region, candidate_use_ssl)
            _probe_client(client, bucket)
            working.append((client, candidate))
        except Exception as exc:  # pragma: no cover
            errors.append(f"{candidate}: {exc}")

    if working:
        return working

    tried = "\n".join(errors[-10:]) if errors else "no endpoints tried"
    raise RuntimeError(
        "Could not connect to storage bucket.\n"
        f"Configured endpoint: {endpoint}\n"
        f"Tried:\n{tried}"
    )


def _iter_clients(clients: list[tuple[object, str]], start_index: int) -> Iterable[tuple[object, str, int]]:
    for shift in range(len(clients)):
        idx = (start_index + shift) % len(clients)
        client, endpoint = clients[idx]
        yield client, endpoint, idx


def _object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _write_report(rows: list[ReportRow], report_path: Path) -> None:
    with report_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["file_name", "source_path", "key", "user_id", "season", "seq", "status", "message"])
        for row in rows:
            writer.writerow([row.file_name, row.source_path, row.key, row.user_id, row.season, row.seq, row.status, row.message])


def main() -> int:
    project_dir = Path.cwd()
    env_file = _read_dotenv(project_dir / os.environ.get("DOTENV_PATH", ".env"))

    source_dir = Path(_env(env_file, "SOURCE_DIR", "./teacher_certificates") or "./teacher_certificates").expanduser().resolve()
    dry_run = _to_bool(_env(env_file, "DRY_RUN", "1"))
    overwrite = _to_bool(_env(env_file, "OVERWRITE", "0"))

    db_service = _env(env_file, "DB_SERVICE", "db") or "db"
    db_user = _env(env_file, "DB_USER", "postgres") or "postgres"
    db_name = _env(env_file, "DB_NAME", "ni_site") or "ni_site"

    storage_endpoint = _env(env_file, "STORAGE_ENDPOINT")
    storage_endpoint_override = _env(env_file, "STORAGE_ENDPOINT_OVERRIDE")
    storage_bucket = _env(env_file, "STORAGE_BUCKET")
    storage_access_key = _env(env_file, "STORAGE_ACCESS_KEY")
    storage_secret_key = _env(env_file, "STORAGE_SECRET_KEY")
    storage_region = _env(env_file, "STORAGE_REGION", "us-east-1") or "us-east-1"
    storage_use_ssl = _to_bool(_env(env_file, "STORAGE_USE_SSL", "false"))

    if not source_dir.exists() or not source_dir.is_dir():
        print(f"ERROR: source directory not found: {source_dir}", file=sys.stderr)
        return 2

    missing_storage = [
        name
        for name, value in (
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
    print(f"DB: service={db_service} db={db_name} user={db_user}")

    items, report_rows = _scan_source(source_dir)
    if not items:
        print("No valid certificate files found.")
        ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        report_path = project_dir / f"teacher_cert_upload_report_{ts}.csv"
        _write_report(report_rows, report_path)
        print(f"Report: {report_path}")
        return 0

    print(f"Valid files found: {len(items)}")
    skipped_invalid = sum(1 for row in report_rows if row.status == "skipped_invalid_name")
    if skipped_invalid:
        print(f"Skipped invalid names: {skipped_invalid}")

    teacher_ids = _load_teacher_ids(db_service, db_user, db_name)
    print(f"Teacher IDs in DB: {len(teacher_ids)}")

    clients: list[tuple[object, str]] = []
    active_client_index = 0
    if not dry_run:
        if not storage_endpoint:
            storage_endpoint = "http://127.0.0.1:9000"
        clients = _resolve_clients(
            endpoint=storage_endpoint,
            bucket=storage_bucket or "",
            access_key=storage_access_key or "",
            secret_key=storage_secret_key or "",
            region=storage_region,
            use_ssl=storage_use_ssl,
            override=storage_endpoint_override,
        )
        print(f"Storage endpoint used (primary): {clients[0][1]}")
        if len(clients) > 1:
            print("Storage endpoint fallbacks:")
            for _, ep in clients[1:]:
                print(f"  - {ep}")

    total = len(items)
    for idx, item in enumerate(items, start=1):
        if item.user_id not in teacher_ids:
            report_rows.append(
                ReportRow(
                    file_name=item.file_name,
                    source_path=str(item.source_path),
                    key=item.key,
                    user_id=str(item.user_id),
                    season=item.season,
                    seq=f"{item.seq:02d}",
                    status="skipped_user_not_teacher",
                    message="user_id not found among teachers",
                )
            )
            continue

        if dry_run:
            report_rows.append(
                ReportRow(
                    file_name=item.file_name,
                    source_path=str(item.source_path),
                    key=item.key,
                    user_id=str(item.user_id),
                    season=item.season,
                    seq=f"{item.seq:02d}",
                    status="would_upload",
                )
            )
            continue

        assert clients

        if not overwrite:
            exists = False
            exists_checked = False
            for current_client, _current_endpoint, current_idx in _iter_clients(clients, active_client_index):
                try:
                    exists = _object_exists(current_client, storage_bucket or "", item.key)
                    exists_checked = True
                    active_client_index = current_idx
                    break
                except Exception:
                    continue
            if exists_checked and exists:
                report_rows.append(
                    ReportRow(
                        file_name=item.file_name,
                        source_path=str(item.source_path),
                        key=item.key,
                        user_id=str(item.user_id),
                        season=item.season,
                        seq=f"{item.seq:02d}",
                        status="skipped_exists",
                    )
                )
                continue

        uploaded = False
        last_err = ""
        for current_client, current_endpoint, current_idx in _iter_clients(clients, active_client_index):
            try:
                current_client.upload_file(
                    Filename=str(item.source_path),
                    Bucket=storage_bucket or "",
                    Key=item.key,
                    ExtraArgs={"ContentType": "image/jpeg"},
                )
                current_client.head_object(Bucket=storage_bucket or "", Key=item.key)
                report_rows.append(
                    ReportRow(
                        file_name=item.file_name,
                        source_path=str(item.source_path),
                        key=item.key,
                        user_id=str(item.user_id),
                        season=item.season,
                        seq=f"{item.seq:02d}",
                        status="uploaded",
                        message=f"endpoint={current_endpoint}",
                    )
                )
                active_client_index = current_idx
                uploaded = True
                break
            except Exception as exc:  # pragma: no cover
                last_err = f"{current_endpoint}: {exc}"
                continue

        if not uploaded:
            report_rows.append(
                ReportRow(
                    file_name=item.file_name,
                    source_path=str(item.source_path),
                    key=item.key,
                    user_id=str(item.user_id),
                    season=item.season,
                    seq=f"{item.seq:02d}",
                    status="error",
                    message=last_err or "unknown upload error",
                )
            )

        if idx % 200 == 0:
            print(f"Processed {idx}/{total} files...")

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    report_path = project_dir / f"teacher_cert_upload_report_{ts}.csv"
    _write_report(report_rows, report_path)

    counters: dict[str, int] = {}
    for row in report_rows:
        counters[row.status] = counters.get(row.status, 0) + 1

    print("Summary:")
    for name in sorted(counters):
        print(f"  {name}: {counters[name]}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
