#!/usr/bin/env bash
set -Eeuo pipefail

# Replace the literal, case-sensitive string "No" with the numero sign "№"
# in canonical school names and addresses. Search-normalized school names are
# recalculated with the same function used by the application.
#
# Examples:
#   ./manual_scripts/replace_school_no_with_number_sign.sh --dry-run
#   ./manual_scripts/replace_school_no_with_number_sign.sh --apply
#   ./manual_scripts/replace_school_no_with_number_sign.sh --apply --compose-file docker-compose.yml

MODE="dry-run"
COMPOSE_FILE="docker-compose.local.yml"

usage() {
  cat <<'EOF'
Usage:
  replace_school_no_with_number_sign.sh [--dry-run|--apply] [--compose-file <path>]

Options:
  --dry-run       Show counts and examples, simulate the update, then ROLLBACK (default).
  --apply         Apply the replacements and COMMIT.
  --compose-file  Compose file containing the api service
                  (default: docker-compose.local.yml).
  -h, --help      Show this help.

Behavior:
  - replaces every literal, case-sensitive "No" with "№" in schools.short_name,
    schools.full_name, and schools.address;
  - recalculates normalized_short_name and normalized_full_name;
  - locks only affected school rows while the transaction is running;
  - makes no changes unless --apply is explicitly provided.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH." >&2
  exit 2
fi

echo "Mode: ${MODE}"
echo "Compose file: ${COMPOSE_FILE}"
echo 'Replacement: literal "No" -> "№" in school names and addresses.'

docker compose -f "${COMPOSE_FILE}" run --rm -T --no-deps api python - "${MODE}" <<'PY'
import asyncio
import sys

from sqlalchemy import func, or_, select, text

from app.core.text_normalization import normalize_directory_name
from app.db.session import SessionLocal, engine
from app.models.school import School


SOURCE = "No"
REPLACEMENT = "№"
MODE = sys.argv[1]


async def main() -> None:
    async with SessionLocal() as session:
        try:
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
                {"lock_name": "manual_scripts.replace_school_no_with_number_sign"},
            )

            target_filter = or_(
                School.short_name.contains(SOURCE),
                School.full_name.contains(SOURCE),
                School.address.contains(SOURCE),
            )
            rows = list(
                (
                    await session.execute(
                        select(School)
                        .where(target_filter)
                        .order_by(School.id)
                        .with_for_update(of=School)
                    )
                )
                .scalars()
                .unique()
                .all()
            )

            short_occurrences = sum(row.short_name.count(SOURCE) for row in rows)
            full_occurrences = sum(row.full_name.count(SOURCE) for row in rows)
            address_occurrences = sum(row.address.count(SOURCE) for row in rows)

            print(f"Affected school rows: {len(rows)}")
            print(f"short_name occurrences: {short_occurrences}")
            print(f"full_name occurrences: {full_occurrences}")
            print(f"address occurrences: {address_occurrences}")
            print(f"Total replacements: {short_occurrences + full_occurrences + address_occurrences}")

            if rows:
                print("Preview (up to 20 rows):")
                for row in rows[:20]:
                    print(f"  #{row.id}: {row.short_name!r} -> {row.short_name.replace(SOURCE, REPLACEMENT)!r}")

            for row in rows:
                row.short_name = row.short_name.replace(SOURCE, REPLACEMENT)
                row.full_name = row.full_name.replace(SOURCE, REPLACEMENT)
                row.address = row.address.replace(SOURCE, REPLACEMENT)
                row.normalized_short_name = normalize_directory_name(row.short_name)
                row.normalized_full_name = normalize_directory_name(row.full_name)

            await session.flush()

            remaining = await session.scalar(
                select(func.count(School.id)).where(
                    or_(
                        School.short_name.contains(SOURCE),
                        School.full_name.contains(SOURCE),
                        School.address.contains(SOURCE),
                    )
                )
            )
            if remaining:
                raise RuntimeError(f"Verification failed: {remaining} rows still contain {SOURCE!r}")

            if MODE == "apply":
                await session.commit()
                print("Replacement applied and committed.")
            else:
                await session.rollback()
                print("Dry-run completed; all changes were rolled back.")
        except Exception:
            await session.rollback()
            raise
        finally:
            await engine.dispose()


asyncio.run(main())
PY

echo "Done."
