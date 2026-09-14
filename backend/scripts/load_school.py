"""Transactional import of the canonical Region -> City -> School directory."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import psycopg2
from psycopg2.extras import Json, execute_values

from app.core.config import settings
from app.core.text_normalization import normalize_directory_name


SCHOOL_HEADERS = [
    "id",
    "region",
    "city",
    "full_name",
    "short_name",
    "address",
    "url",
    "email",
    "is_sirius",
    "is_consortium",
    "is_peterson",
    "is_partner",
    "is_platform",
    "curator",
    "info",
]
USER_HEADERS = ["user_id", "source_school_id", "school_status"]
OVERRIDE_HEADERS = ["user_id", "region_name"]
FLAG_FIELDS = ["is_sirius", "is_consortium", "is_peterson", "is_partner", "is_platform"]
EXPECTED_SCHOOLS = 54_517
EXPECTED_REGIONS = 89
EXPECTED_CANONICAL_CITIES = 29_171
EXPECTED_USER_ROWS = 17_279
EXPECTED_SELECTED = 17_011
EXPECTED_MISSING = 268
ADVISORY_LOCK_KEY = 2_604_202_609
UTF8_BOM = b"\xef\xbb\xbf"


class ImportValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SchoolRow:
    source_school_id: int
    region: str
    city: str
    full_name: str
    short_name: str
    address: str
    url: str | None
    email: str | None
    is_sirius: bool
    is_consortium: bool
    is_peterson: bool
    is_partner: bool
    is_platform: bool
    curator: str | None
    info: str | None


@dataclass(frozen=True)
class UserSchoolRow:
    user_id: int
    source_school_id: int | None
    school_status: str


def normalize_name(value: str) -> str:
    return normalize_directory_name(value)


def _display_name(values: Iterable[str]) -> str:
    unique = {" ".join(unicodedata.normalize("NFKC", value).strip().split()) for value in values}
    return sorted(unique, key=lambda value: ("ё" not in value.casefold(), value.casefold(), value))[0]


def _optional(value: str | None) -> str | None:
    stripped = (value or "").strip()
    return stripped or None


def _required(value: str | None, *, field: str, row_number: int) -> str:
    stripped = (value or "").strip()
    if not stripped:
        raise ImportValidationError(f"row {row_number}: {field} is required")
    return stripped


def _positive_int(value: str | None, *, field: str, row_number: int) -> int:
    raw = _required(value, field=field, row_number=row_number)
    try:
        result = int(raw)
    except ValueError as exc:
        raise ImportValidationError(f"row {row_number}: {field} must be an integer") from exc
    if result <= 0:
        raise ImportValidationError(f"row {row_number}: {field} must be positive")
    return result


def _flag(value: str | None, *, field: str, row_number: int) -> bool:
    raw = (value or "").strip()
    if raw in ("", "0"):
        return False
    if raw == "1":
        return True
    raise ImportValidationError(f"row {row_number}: {field} must be blank, 0 or 1")


def _read_dicts(path: Path, expected_headers: list[str]) -> list[dict[str, str]]:
    if not path.is_file():
        raise ImportValidationError(f"file not found: {path}")
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter=";")
            if reader.fieldnames != expected_headers:
                raise ImportValidationError(
                    f"unexpected headers in {path}: expected {expected_headers}, got {reader.fieldnames}"
                )
            return list(reader)
    except UnicodeDecodeError as exc:
        raise ImportValidationError(f"file is not valid UTF-8: {path}") from exc


def _has_utf8_bom(path: Path) -> bool:
    with path.open("rb") as handle:
        return handle.read(len(UTF8_BOM)) == UTF8_BOM


def read_schools(path: Path) -> list[SchoolRow]:
    rows = _read_dicts(path, SCHOOL_HEADERS)
    result: list[SchoolRow] = []
    seen: set[int] = set()
    for row_number, row in enumerate(rows, start=2):
        source_id = _positive_int(row["id"], field="id", row_number=row_number)
        if source_id in seen:
            raise ImportValidationError(f"row {row_number}: duplicate school id {source_id}")
        seen.add(source_id)
        flags = {field: _flag(row[field], field=field, row_number=row_number) for field in FLAG_FIELDS}
        result.append(
            SchoolRow(
                source_school_id=source_id,
                region=_required(row["region"], field="region", row_number=row_number),
                city=_required(row["city"], field="city", row_number=row_number),
                full_name=_required(row["full_name"], field="full_name", row_number=row_number),
                short_name=_required(row["short_name"], field="short_name", row_number=row_number),
                address=_required(row["address"], field="address", row_number=row_number),
                url=_optional(row["url"]),
                email=_optional(row["email"]),
                curator=_optional(row["curator"]),
                info=_optional(row["info"]),
                **flags,
            )
        )
    return result


def read_user_schools(path: Path) -> list[UserSchoolRow]:
    rows = _read_dicts(path, USER_HEADERS)
    result: list[UserSchoolRow] = []
    seen: set[int] = set()
    for row_number, row in enumerate(rows, start=2):
        user_id = _positive_int(row["user_id"], field="user_id", row_number=row_number)
        if user_id in seen:
            raise ImportValidationError(f"row {row_number}: duplicate user_id {user_id}")
        seen.add(user_id)
        status = _required(row["school_status"], field="school_status", row_number=row_number)
        if status not in {"selected", "missing"}:
            raise ImportValidationError(f"row {row_number}: unsupported school_status {status}")
        raw_source = (row["source_school_id"] or "").strip()
        source_id = _positive_int(raw_source, field="source_school_id", row_number=row_number) if raw_source else None
        if status == "selected" and source_id is None:
            raise ImportValidationError(f"row {row_number}: selected user requires source_school_id")
        if status == "missing" and source_id is not None:
            raise ImportValidationError(f"row {row_number}: missing user must not have source_school_id")
        result.append(UserSchoolRow(user_id, source_id, status))
    return result


def read_region_overrides(path: Path | None) -> dict[int, str]:
    if path is None:
        return {}
    rows = _read_dicts(path, OVERRIDE_HEADERS)
    result: dict[int, str] = {}
    for row_number, row in enumerate(rows, start=2):
        user_id = _positive_int(row["user_id"], field="user_id", row_number=row_number)
        if user_id in result:
            raise ImportValidationError(f"row {row_number}: duplicate override user_id {user_id}")
        result[user_id] = _required(row["region_name"], field="region_name", row_number=row_number)
    return result


def validate_source(schools: list[SchoolRow], users: list[UserSchoolRow]) -> dict[str, int]:
    source_ids = {row.source_school_id for row in schools}
    selected_refs = {row.source_school_id for row in users if row.source_school_id is not None}
    unknown = selected_refs - source_ids
    stats = {
        "regions_from_csv": len({normalize_name(row.region) for row in schools}),
        "cities_exact_source_pairs": len({(row.region, row.city) for row in schools}),
        "cities_canonical_target": len(
            {(normalize_name(row.region), normalize_name(row.city)) for row in schools}
        ),
        "schools_from_csv": len(schools),
        "user_mapping_rows": len(users),
        "selected_source_rows": sum(row.school_status == "selected" for row in users),
        "missing_source_rows": sum(row.school_status == "missing" for row in users),
        "unknown_source_school_ids": len(unknown),
        "duplicate_user_ids": 0,
        "duplicate_source_school_ids": 0,
    }
    stats["cities_merged_source_variants"] = (
        stats["cities_exact_source_pairs"] - stats["cities_canonical_target"]
    )
    expected = {
        "regions_from_csv": EXPECTED_REGIONS,
        "cities_canonical_target": EXPECTED_CANONICAL_CITIES,
        "schools_from_csv": EXPECTED_SCHOOLS,
        "user_mapping_rows": EXPECTED_USER_ROWS,
        "selected_source_rows": EXPECTED_SELECTED,
        "missing_source_rows": EXPECTED_MISSING,
        "unknown_source_school_ids": 0,
    }
    mismatches = {key: (stats[key], value) for key, value in expected.items() if stats[key] != value}
    if mismatches:
        raise ImportValidationError(f"source control totals do not match: {mismatches}")
    return stats


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sync_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgresql+psycopg2://", "postgresql://"
    )


def _write_review(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["user_id", "legacy_country", "legacy_city", "candidate_regions", "reason"],
            delimiter=";",
        )
        writer.writeheader()
        writer.writerows(rows)


def _is_russia(value: str | None) -> bool:
    return normalize_name(value or "") in {"россия", "российская федерация", "рф", "russia"}


def import_directory(
    *,
    schools_path: Path,
    users_path: Path,
    batch_id: str,
    apply: bool,
    review_output: Path,
    region_overrides_path: Path | None,
    database_url: str,
) -> dict[str, int | str]:
    schools = read_schools(schools_path)
    users = read_user_schools(users_path)
    region_overrides = read_region_overrides(region_overrides_path)
    stats: dict[str, int | str] = validate_source(schools, users)
    stats["schools_sha256"] = _sha256(schools_path)
    stats["users_sha256"] = _sha256(users_path)
    stats["schools_has_utf8_bom"] = int(_has_utf8_bom(schools_path))
    stats["users_has_utf8_bom"] = int(_has_utf8_bom(users_path))
    stats["batch_id"] = batch_id

    region_variants: dict[str, set[str]] = defaultdict(set)
    city_variants: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in schools:
        region_key = normalize_name(row.region)
        region_variants[region_key].add(row.region)
        city_variants[(region_key, normalize_name(row.city))].add(row.city)

    connection = psycopg2.connect(_sync_url(database_url))
    try:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (ADVISORY_LOCK_KEY,))
            cursor.execute(
                "SELECT to_regclass('public.regions'), to_regclass('public.schools_legacy'), "
                "to_regclass('public.school_import_batches')"
            )
            if cursor.fetchone() != ("regions", "schools_legacy", "school_import_batches"):
                raise ImportValidationError("database is not migrated to the canonical school schema")
            cursor.execute("SELECT 1 FROM school_import_batches WHERE batch_id = %s", (batch_id,))
            if cursor.fetchone():
                raise ImportValidationError(f"batch_id already applied: {batch_id}")
            cursor.execute("SELECT (SELECT count(*) FROM regions), (SELECT count(*) FROM schools)")
            region_count, school_count = cursor.fetchone()
            if region_count or school_count:
                raise ImportValidationError(
                    f"target directory is not empty: regions={region_count}, schools={school_count}"
                )

            cursor.execute("SELECT id FROM users")
            db_user_ids = {row[0] for row in cursor.fetchall()}
            csv_user_ids = {row.user_id for row in users}
            stats["csv_users_absent_in_db"] = len(csv_user_ids - db_user_ids)
            stats["db_users_absent_in_csv"] = len(db_user_ids - csv_user_ids)
            if stats["csv_users_absent_in_db"] or stats["db_users_absent_in_csv"]:
                raise ImportValidationError(
                    "user_id sets differ: "
                    f"csv_missing_in_db={stats['csv_users_absent_in_db']}, "
                    f"db_missing_in_csv={stats['db_users_absent_in_csv']}"
                )

            cursor.execute(
                "INSERT INTO school_import_batches "
                "(batch_id, schools_sha256, users_sha256, stats) VALUES (%s, %s, %s, %s)",
                (batch_id, stats["schools_sha256"], stats["users_sha256"], Json(stats)),
            )

            region_ids: dict[str, int] = {}
            for region_key in sorted(region_variants):
                cursor.execute(
                    "INSERT INTO regions (country_code, name, normalized_name) VALUES ('RU', %s, %s) RETURNING id",
                    (_display_name(region_variants[region_key]), region_key),
                )
                region_ids[region_key] = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO regions (country_code, name, normalized_name, is_other) "
                "VALUES (NULL, 'Другой регион / другая страна', 'другой регион / другая страна', true) "
                "RETURNING id"
            )
            other_region_id = cursor.fetchone()[0]
            override_region_ids: dict[int, int] = {}
            missing_user_ids = {row.user_id for row in users if row.school_status == "missing"}
            unknown_override_users = set(region_overrides) - missing_user_ids
            if unknown_override_users:
                raise ImportValidationError(
                    f"region overrides contain users that are not missing: {sorted(unknown_override_users)}"
                )
            for user_id, region_name in region_overrides.items():
                if region_name == "__other__":
                    override_region_ids[user_id] = other_region_id
                    continue
                region_key = normalize_name(region_name)
                if region_key not in region_ids:
                    raise ImportValidationError(
                        f"region override for user {user_id} does not match the catalog: {region_name}"
                    )
                override_region_ids[user_id] = region_ids[region_key]

            city_values = [
                (region_ids[region_key], _display_name(variants), city_key)
                for (region_key, city_key), variants in sorted(city_variants.items())
            ]
            returned_cities = execute_values(
                cursor,
                "INSERT INTO cities (region_id, name, normalized_name) VALUES %s "
                "RETURNING id, region_id, normalized_name",
                city_values,
                page_size=2_000,
                fetch=True,
            )
            city_ids = {(region_id, normalized): city_id for city_id, region_id, normalized in returned_cities}

            school_values = []
            ordered_source_ids = []
            for row in schools:
                region_id = region_ids[normalize_name(row.region)]
                city_id = city_ids[(region_id, normalize_name(row.city))]
                ordered_source_ids.append(row.source_school_id)
                school_values.append(
                    (
                        city_id,
                        row.full_name,
                        row.short_name,
                        normalize_name(row.full_name),
                        normalize_name(row.short_name),
                        row.address,
                        row.url,
                        row.email,
                        row.is_sirius,
                        row.is_consortium,
                        row.is_peterson,
                        row.is_partner,
                        row.is_platform,
                        row.curator,
                        row.info,
                    )
                )
            returned_schools = execute_values(
                cursor,
                "INSERT INTO schools "
                "(city_id, full_name, short_name, normalized_full_name, normalized_short_name, address, "
                "url, email, is_sirius, is_consortium, is_peterson, is_partner, is_platform, curator, info) "
                "VALUES %s RETURNING id",
                school_values,
                page_size=1_000,
                fetch=True,
            )
            if len(returned_schools) != len(ordered_source_ids):
                raise ImportValidationError("not all schools were inserted")
            source_to_school = dict(zip(ordered_source_ids, (row[0] for row in returned_schools), strict=True))
            execute_values(
                cursor,
                "INSERT INTO school_source_map (batch_id, source_school_id, school_id) VALUES %s",
                [(batch_id, source_id, school_id) for source_id, school_id in source_to_school.items()],
                page_size=2_000,
            )

            selected_values = [
                (row.user_id, source_to_school[row.source_school_id])
                for row in users
                if row.source_school_id is not None
            ]
            cursor.execute(
                "CREATE TEMP TABLE selected_user_schools "
                "(user_id integer PRIMARY KEY, school_id integer) ON COMMIT DROP"
            )
            execute_values(
                cursor,
                "INSERT INTO selected_user_schools (user_id, school_id) VALUES %s",
                selected_values,
                page_size=2_000,
            )
            cursor.execute(
                "UPDATE users u SET school_id = m.school_id, region_id = c.region_id, "
                "school_status = 'selected'::school_status_enum "
                "FROM selected_user_schools m JOIN schools s ON s.id = m.school_id "
                "JOIN cities c ON c.id = s.city_id WHERE u.id = m.user_id"
            )
            stats["selected_users_updated"] = cursor.rowcount

            missing_ids = [row.user_id for row in users if row.school_status == "missing"]
            cursor.execute(
                "SELECT id, role::text, class_grade, country, city FROM users WHERE id = ANY(%s)",
                (missing_ids,),
            )
            missing_users = cursor.fetchall()
            if len(missing_users) != len(missing_ids):
                raise ImportValidationError("not all users without schools were loaded from the database")
            city_regions: dict[str, set[int]] = defaultdict(set)
            region_names = {value: key for key, value in region_ids.items()}
            for region_key, city_key in city_variants:
                city_regions[city_key].add(region_ids[region_key])

            resolved_missing: list[tuple[int, int, str]] = []
            review_rows: list[dict[str, object]] = []
            not_required = 0
            for user_id, role, class_grade, country, city in missing_users:
                if user_id in override_region_ids:
                    target_status = "not_required" if role == "student" and class_grade == 0 else "missing"
                    resolved_missing.append((user_id, override_region_ids[user_id], target_status))
                    not_required += int(target_status == "not_required")
                    continue
                if role == "student" and class_grade == 0:
                    candidates = city_regions.get(normalize_name(city or ""), set())
                    region_id = next(iter(candidates)) if len(candidates) == 1 else other_region_id if not _is_russia(country) else None
                    if region_id is None:
                        review_rows.append(
                            {
                                "user_id": user_id,
                                "legacy_country": country or "",
                                "legacy_city": city or "",
                                "candidate_regions": "|".join(
                                    sorted(_display_name(region_variants[region_names[item]]) for item in candidates)
                                ),
                                "reason": "preschool_region_unresolved",
                            }
                        )
                        continue
                    resolved_missing.append((user_id, region_id, "not_required"))
                    not_required += 1
                    continue
                if not _is_russia(country):
                    resolved_missing.append((user_id, other_region_id, "missing"))
                    continue
                candidates = city_regions.get(normalize_name(city or ""), set())
                if len(candidates) == 1:
                    resolved_missing.append((user_id, next(iter(candidates)), "missing"))
                    continue
                review_rows.append(
                    {
                        "user_id": user_id,
                        "legacy_country": country or "",
                        "legacy_city": city or "",
                        "candidate_regions": "|".join(
                            sorted(_display_name(region_variants[region_names[item]]) for item in candidates)
                        ),
                        "reason": "city_not_found" if not candidates else "city_in_multiple_regions",
                    }
                )

            stats["not_required_users"] = not_required
            stats["region_overrides_used"] = len(override_region_ids)
            stats["unresolved_user_regions"] = len(review_rows)
            if review_rows:
                _write_review(review_output, review_rows)
                raise ImportValidationError(
                    f"{len(review_rows)} user regions are unresolved; review {review_output}"
                )
            cursor.execute(
                "CREATE TEMP TABLE missing_user_regions "
                "(user_id integer PRIMARY KEY, region_id integer, school_status school_status_enum) "
                "ON COMMIT DROP"
            )
            execute_values(
                cursor,
                "INSERT INTO missing_user_regions (user_id, region_id, school_status) VALUES %s",
                resolved_missing,
                page_size=1_000,
            )
            cursor.execute(
                "UPDATE users u SET region_id = m.region_id, school_id = NULL, school_status = m.school_status "
                "FROM missing_user_regions m WHERE u.id = m.user_id"
            )
            stats["missing_users_updated"] = cursor.rowcount

            cursor.execute("SELECT count(*) FROM regions WHERE is_other = false")
            stats["target_regions"] = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM cities")
            stats["target_cities"] = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM schools")
            stats["target_schools"] = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM users WHERE region_id IS NULL")
            stats["target_users_without_region"] = cursor.fetchone()[0]
            cursor.execute(
                "SELECT count(*) FROM users WHERE "
                "(school_status = 'selected' AND school_id IS NULL) OR "
                "(school_status <> 'selected' AND school_id IS NOT NULL)"
            )
            stats["target_users_with_bad_school_state"] = cursor.fetchone()[0]
            cursor.execute(
                "SELECT count(*) FROM users u "
                "LEFT JOIN regions r ON r.id = u.region_id "
                "LEFT JOIN schools s ON s.id = u.school_id "
                "WHERE (u.region_id IS NOT NULL AND r.id IS NULL) "
                "OR (u.school_id IS NOT NULL AND s.id IS NULL)"
            )
            stats["target_users_with_bad_fk"] = cursor.fetchone()[0]
            if (
                stats["target_regions"] != EXPECTED_REGIONS
                or stats["target_cities"] != EXPECTED_CANONICAL_CITIES
                or stats["target_schools"] != EXPECTED_SCHOOLS
                or stats["target_users_without_region"] != 0
                or stats["target_users_with_bad_school_state"] != 0
                or stats["target_users_with_bad_fk"] != 0
            ):
                raise ImportValidationError(f"target control totals do not match: {stats}")

            cursor.execute(
                "UPDATE school_import_batches SET stats = %s WHERE batch_id = %s",
                (Json(stats), batch_id),
            )
            cursor.execute(
                "INSERT INTO audit_logs "
                "(user_id, action, method, path, status_code, details, created_at) "
                "VALUES (NULL, 'school_directory_import', 'MANUAL', '/manual/import-school-directory', "
                "200, %s, now())",
                (Json({"batch_id": batch_id, "regions": stats["target_regions"], "cities": stats["target_cities"], "schools": stats["target_schools"]}),),
            )

        if apply:
            connection.commit()
            stats["mode"] = "applied"
        else:
            connection.rollback()
            stats["mode"] = "dry-run-rolled-back"
        return stats
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schools", required=True, type=Path)
    parser.add_argument("--users", required=True, type=Path)
    parser.add_argument("--batch-id", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Validate and roll back (default)")
    mode.add_argument("--apply", action="store_true", help="Commit only after every check passes")
    parser.add_argument("--review-output", type=Path, default=Path("temporary/user_region_review.csv"))
    parser.add_argument("--region-overrides", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.batch_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for character in args.batch_id):
        print("Invalid --batch-id; use letters, digits, dot, underscore or hyphen", file=sys.stderr)
        return 2
    database_url = os.getenv("ALEMBIC_DATABASE_URL") or os.getenv("DATABASE_URL") or settings.DATABASE_URL
    try:
        stats = import_directory(
            schools_path=args.schools,
            users_path=args.users,
            batch_id=args.batch_id,
            apply=args.apply,
            review_output=args.review_output,
            region_overrides_path=args.region_overrides,
            database_url=database_url,
        )
    except ImportValidationError as exc:
        print(f"IMPORT_BLOCKED: {exc}", file=sys.stderr)
        return 3
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
