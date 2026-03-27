#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parseaddr
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.email import send_email  # noqa: E402


DEFAULT_SUBJECT = "Подтверждение участия в очном туре"
DEFAULT_EMAILS_CSV = ROOT / "emails_final.csv"
DEFAULT_BODY_FILE = ROOT / "email_text.md"
DEFAULT_REPORTS_DIR = ROOT / "reports"

EMAIL_HEADER_CANDIDATES = (
    "email",
    "emails",
    "mail",
    "e-mail",
    "email_address",
    "emailaddress",
)


@dataclass(slots=True)
class PreparedEmail:
    original: str
    normalized: str


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send bulk email using the configured transactional email provider."
    )
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_EMAILS_CSV),
        help="Path to CSV file with recipient emails. Default: ./emails_final.csv",
    )
    parser.add_argument(
        "--body",
        default=str(DEFAULT_BODY_FILE),
        help="Path to text/markdown file with email body. Default: ./email_text.md",
    )
    parser.add_argument(
        "--subject",
        default=DEFAULT_SUBJECT,
        help=f"Email subject. Default: {DEFAULT_SUBJECT!r}",
    )
    parser.add_argument(
        "--sleep-sec",
        type=float,
        default=0.2,
        help="Delay between emails in seconds. Default: 0.2",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of emails to process.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate input and create a report without sending emails.",
    )
    parser.add_argument(
        "--report-dir",
        default=str(DEFAULT_REPORTS_DIR),
        help="Directory for CSV report. Default: ./reports",
    )
    return parser.parse_args()


def _is_valid_email(value: str) -> bool:
    _, addr = parseaddr(value)
    if not addr:
        return False
    if "@" not in addr:
        return False
    # Conservative validation. Avoid accepting obvious garbage.
    return re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", addr) is not None


def _normalize_email(value: str) -> str:
    _, addr = parseaddr(value.strip())
    return addr.strip().lower()


def _read_body(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Body file not found: {path}")
    body = path.read_text(encoding="utf-8-sig").strip()
    if not body:
        raise RuntimeError(f"Body file is empty: {path}")
    return body


def _extract_email_from_row(row: list[str], header_map: dict[str, int] | None) -> str | None:
    if header_map:
        for key in EMAIL_HEADER_CANDIDATES:
            idx = header_map.get(key)
            if idx is not None and idx < len(row):
                return row[idx].strip()
        return None
    if not row:
        return None
    return row[0].strip()


def _load_emails(csv_path: Path, limit: int | None) -> tuple[list[PreparedEmail], list[tuple[str, str]]]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    text = csv_path.read_text(encoding="utf-8-sig")
    if not text.strip():
        raise RuntimeError(f"CSV file is empty: {csv_path}")

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ","

    rows = csv.reader(text.splitlines(), delimiter=delimiter)
    prepared: list[PreparedEmail] = []
    rejected: list[tuple[str, str]] = []
    seen: set[str] = set()
    header_map: dict[str, int] | None = None

    for idx, row in enumerate(rows, start=1):
        if not row or not any(cell.strip() for cell in row):
            continue
        stripped = [cell.strip() for cell in row]

        if idx == 1:
            normalized_header = [cell.lower() for cell in stripped]
            if any(cell in EMAIL_HEADER_CANDIDATES for cell in normalized_header):
                header_map = {name: i for i, name in enumerate(normalized_header)}
                continue

        raw_email = _extract_email_from_row(stripped, header_map)
        if not raw_email:
            rejected.append(("", f"row_{idx}: email_not_found"))
            continue
        if not _is_valid_email(raw_email):
            rejected.append((raw_email, f"row_{idx}: invalid_email"))
            continue

        normalized = _normalize_email(raw_email)
        if normalized in seen:
            rejected.append((raw_email, f"row_{idx}: duplicate"))
            continue

        seen.add(normalized)
        prepared.append(PreparedEmail(original=raw_email, normalized=normalized))
        if limit is not None and len(prepared) >= limit:
            break

    return prepared, rejected


def _build_report_path(report_dir: Path, dry_run: bool) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")
    mode = "dry_run" if dry_run else "sent"
    return report_dir / f"bulk_email_{mode}_{stamp}.csv"


def _write_report(
    path: Path,
    subject: str,
    body_file: Path,
    rows: list[tuple[str, str, str]],
) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["email", "status", "message", "subject", "body_file"])
        for email, status, message in rows:
            writer.writerow([email, status, message, subject, str(body_file)])


def main() -> int:
    args = _parse_args()

    csv_path = Path(args.csv).resolve()
    body_path = Path(args.body).resolve()
    report_dir = Path(args.report_dir).resolve()

    body = _read_body(body_path)
    prepared, rejected = _load_emails(csv_path, args.limit)

    report_rows: list[tuple[str, str, str]] = []
    for email, reason in rejected:
        report_rows.append((email, "skipped", reason))

    if not prepared:
        report_path = _build_report_path(report_dir, args.dry_run)
        _write_report(report_path, args.subject, body_path, report_rows)
        print("Prepared recipients: 0")
        print(f"Skipped: {len(rejected)}")
        print(f"Report: {report_path}")
        return 0

    print(f"CSV: {csv_path}")
    print(f"Body: {body_path}")
    print(f"Subject: {args.subject}")
    print(f"Prepared recipients: {len(prepared)}")
    print(f"Skipped before send: {len(rejected)}")
    print(f"Mode: {'dry-run' if args.dry_run else 'send'}")

    sent = 0
    failed = 0

    for item in prepared:
        if args.dry_run:
            report_rows.append((item.normalized, "dry_run", "ready_to_send"))
            continue

        try:
            send_email(
                to_email=item.normalized,
                subject=args.subject,
                body=body,
            )
            sent += 1
            report_rows.append((item.normalized, "sent", "ok"))
        except Exception as exc:  # pragma: no cover - operational script
            failed += 1
            report_rows.append((item.normalized, "failed", str(exc)))

        if args.sleep_sec > 0:
            time.sleep(args.sleep_sec)

    report_path = _build_report_path(report_dir, args.dry_run)
    _write_report(report_path, args.subject, body_path, report_rows)

    if args.dry_run:
        print(f"Dry-run ready: {len(prepared)}")
    else:
        print(f"Sent: {sent}")
        print(f"Failed: {failed}")
    print(f"Report: {report_path}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
