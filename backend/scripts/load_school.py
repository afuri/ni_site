from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.models.school import School


CITY_HEADERS = {"city", "город"}
SCHOOL_HEADERS = {"school_name", "school", "школа"}
FULL_NAME_HEADERS = {"full_school_name", "full_name", "полное_название"}
EMAIL_HEADERS = {"email", "e-mail"}
CONSORCIUM_HEADERS = {"consorcium", "consortium"}
PETERSON_HEADERS = {"peterson"}
SIRIUS_HEADERS = {"sirius"}


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "+psycopg2")


def _normalize(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _detect_columns(headers: list[str]) -> dict[str, int]:
    normalized = [header.lower() for header in headers]
    mapping: dict[str, int] = {}
    for idx, name in enumerate(normalized):
        if name in CITY_HEADERS:
            mapping["city"] = idx
        elif name in SCHOOL_HEADERS:
            mapping["name"] = idx
        elif name in FULL_NAME_HEADERS:
            mapping["full_school_name"] = idx
        elif name in EMAIL_HEADERS:
            mapping["email"] = idx
        elif name in CONSORCIUM_HEADERS:
            mapping["consorcium"] = idx
        elif name in PETERSON_HEADERS:
            mapping["peterson"] = idx
        elif name in SIRIUS_HEADERS:
            mapping["sirius"] = idx
    return mapping


def _parse_flag(value: object | None) -> int:
    raw = _normalize(value)
    if raw == "1":
        return 1
    return 0


def _optional_value(value: object | None) -> str | None:
    raw = _normalize(value)
    return raw if raw else None


def _read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter=";")
        rows = [row for row in reader if row]

    if not rows:
        return []

    header_idx = 0
    headers: list[str] | None = None
    detected: dict[str, int] = {}
    for idx, row in enumerate(rows[:5]):
        normalized_row = [_normalize(value) for value in row]
        detected = _detect_columns(normalized_row)
        if detected.get("city") is not None and detected.get("name") is not None:
            header_idx = idx
            headers = normalized_row
            break

    data_rows = rows
    if headers is not None:
        data_rows = rows[header_idx + 1 :]
        detected = _detect_columns(headers)
    else:
        detected = {}

    city_idx = detected.get("city", 0)
    school_idx = detected.get("name", 1)
    full_name_idx = detected.get("full_school_name")
    email_idx = detected.get("email")
    consorcium_idx = detected.get("consorcium")
    peterson_idx = detected.get("peterson")
    sirius_idx = detected.get("sirius")

    seen: set[tuple[str, str]] = set()
    items: list[dict[str, str]] = []
    for row in data_rows:
        city = _normalize(row[city_idx] if city_idx < len(row) else None)
        school = _normalize(row[school_idx] if school_idx < len(row) else None)
        if not city or not school:
            continue
        key = (city, school)
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "city": city,
                "name": school,
                "full_school_name": _optional_value(row[full_name_idx]) if full_name_idx is not None else None,
                "email": _optional_value(row[email_idx]) if email_idx is not None else None,
                "consorcium": _parse_flag(row[consorcium_idx]) if consorcium_idx is not None else 0,
                "peterson": _parse_flag(row[peterson_idx]) if peterson_idx is not None else 0,
                "sirius": _parse_flag(row[sirius_idx]) if sirius_idx is not None else 0,
            }
        )
    return items


def main() -> int:
    default_path = Path(__file__).resolve().parent / "schools.csv"
    parser = argparse.ArgumentParser(description="Load schools directory into the database.")
    parser.add_argument("path", nargs="?", type=Path, default=default_path, help="Path to schools.csv")
    parser.add_argument("--truncate", action="store_true", help="Clear schools table before loading")
    args = parser.parse_args()

    db_url = os.getenv("ALEMBIC_DATABASE_URL") or settings.DATABASE_URL
    if not db_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    if not args.path.exists():
        print(f"File not found: {args.path}", file=sys.stderr)
        return 2

    items = _read_rows(args.path)
    if not items:
        print("No school rows found in the CSV.", file=sys.stderr)
        return 3

    engine = create_engine(_sync_url(db_url))
    with engine.begin() as conn:
        if args.truncate:
            conn.execute(text("TRUNCATE TABLE schools"))
        stmt = insert(School).values(items)
        stmt = stmt.on_conflict_do_nothing(index_elements=["city", "name"])
        conn.execute(stmt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
