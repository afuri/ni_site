#!/usr/bin/env bash
set -Eeuo pipefail

# Replace selected canonical school IDs for every matching user.
# Dry-run is the default; use --apply to commit the changes.
#
# Replacements:
#   110768 -> 163553
#   135458 -> 163563
#   139386 -> 163554

MODE="dry-run"
COMPOSE_FILE="docker-compose.local.yml"

usage() {
  cat <<'EOF'
Usage:
  replace_user_school_ids.sh [--dry-run|--apply] [--compose-file <path>]

Options:
  --dry-run       Show affected user counts, simulate the update, then ROLLBACK
                  (default).
  --apply         Apply all three school ID replacements and COMMIT.
  --compose-file  Compose file containing the api service
                  (default: docker-compose.local.yml).
  -h, --help      Show this help.

Replacements in users.school_id:
  110768 -> 163553
  135458 -> 163563
  139386 -> 163554

Only users.school_id is changed. User region, school status, and all other
fields remain unchanged.
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
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "--compose-file requires a path." >&2
        usage
        exit 2
      fi
      COMPOSE_FILE="$2"
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

docker compose -f "${COMPOSE_FILE}" run --rm -T --no-deps api python - "${MODE}" <<'PY'
import asyncio
import sys

from sqlalchemy import case, func, select, text, update

from app.db.session import SessionLocal, engine
from app.models.user import User


MODE = sys.argv[1]
REPLACEMENTS = {
    110768: 163553,
    135458: 163563,
    139386: 163554,
}


async def counts_by_school(session, school_ids: list[int]) -> dict[int, int]:
    rows = await session.execute(
        select(User.school_id, func.count(User.id))
        .where(User.school_id.in_(school_ids))
        .group_by(User.school_id)
    )
    return {int(school_id): int(count) for school_id, count in rows.all()}


async def main() -> None:
    source_ids = list(REPLACEMENTS)
    target_ids = list(REPLACEMENTS.values())

    async with SessionLocal() as session:
        try:
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
                {"lock_name": "manual_scripts.replace_user_school_ids"},
            )

            before = await counts_by_school(session, source_ids)
            print("Users found for replacement:")
            for source_id, target_id in REPLACEMENTS.items():
                print(f"  {source_id} -> {target_id}: {before.get(source_id, 0)} user(s)")
            print(f"Total affected users: {sum(before.values())}")

            result = await session.execute(
                update(User)
                .where(User.school_id.in_(source_ids))
                .values(
                    school_id=case(
                        REPLACEMENTS,
                        value=User.school_id,
                        else_=User.school_id,
                    )
                )
                .returning(User.id)
            )
            updated_count = len(result.scalars().all())

            remaining = await session.scalar(
                select(func.count(User.id)).where(User.school_id.in_(source_ids))
            )
            after = await counts_by_school(session, target_ids)

            print(f"Rows updated: {updated_count}")
            print(f"Users still assigned to source IDs: {remaining or 0}")
            print("Users assigned to target IDs after the simulated update:")
            for target_id in target_ids:
                print(f"  {target_id}: {after.get(target_id, 0)} user(s)")

            if updated_count != sum(before.values()) or remaining:
                raise RuntimeError("Verification failed; transaction will be rolled back.")

            if MODE == "apply":
                await session.commit()
                print("School ID replacements applied and committed.")
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
