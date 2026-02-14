#!/usr/bin/env bash
set -Eeuo pipefail

# Bulk update users.country/city/school from CSV (user_id,country,city,school)
# Default CSV file in repo root: ./user_geo.csv
#
# Examples:
#   ./bulk_update_user_geo.sh --dry-run
#   ./bulk_update_user_geo.sh --apply
#   ./bulk_update_user_geo.sh --dry-run --delimiter ',' --csv ./user_geo.csv

CSV_FILE="user_geo.csv"
DELIMITER=";"
MODE="dry-run"
MODE_SET=0

usage() {
  cat <<'EOF'
Usage:
  bulk_update_user_geo.sh [--dry-run|--apply] [--csv <path>] [--delimiter <;|,>]

Options:
  --dry-run           Validate and simulate update, then ROLLBACK (default).
  --apply             Apply updates and COMMIT.
  --csv <path>        Path to CSV file (default: ./user_geo.csv).
  --delimiter <char>  CSV delimiter: ';' or ',' (default: ';').
  -h, --help          Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      MODE="dry-run"
      MODE_SET=1
      shift
      ;;
    --apply)
      MODE="apply"
      MODE_SET=1
      shift
      ;;
    --csv)
      CSV_FILE="${2:-}"
      shift 2
      ;;
    --delimiter)
      DELIMITER="${2:-}"
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

# Compatibility with existing regrade scripts:
# DRY_RUN=1 ./script.sh  -> dry-run mode
if [[ "${MODE_SET}" == "0" && "${DRY_RUN:-0}" == "1" ]]; then
  MODE="dry-run"
fi

if [[ -z "${CSV_FILE}" ]]; then
  echo "CSV path is empty." >&2
  exit 2
fi

if [[ ! -f "${CSV_FILE}" ]]; then
  echo "CSV file not found: ${CSV_FILE}" >&2
  exit 2
fi

if [[ "${DELIMITER}" != ";" && "${DELIMITER}" != "," ]]; then
  echo "Unsupported delimiter '${DELIMITER}'. Use ';' or ','." >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH." >&2
  exit 2
fi

if ! docker compose ps -q db >/dev/null 2>&1; then
  echo "Cannot access docker compose db service." >&2
  exit 2
fi

DB_CID="$(docker compose ps -q db)"
if [[ -z "${DB_CID}" ]]; then
  echo "db container is not running." >&2
  exit 2
fi

CONTAINER_CSV="/tmp/user_geo_import_$$.csv"
cleanup() {
  docker compose exec -T db rm -f "${CONTAINER_CSV}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Mode: ${MODE}"
echo "CSV: ${CSV_FILE}"
echo "Delimiter: '${DELIMITER}'"

echo "Copy CSV into db container..."
docker cp "${CSV_FILE}" "${DB_CID}:${CONTAINER_CSV}"

echo "Run SQL..."
SQL_BODY=$(cat <<SQL
BEGIN;

CREATE TEMP TABLE stg_user_geo (
  user_id bigint,
  country text,
  city text,
  school text
);

COPY stg_user_geo(user_id, country, city, school)
FROM '${CONTAINER_CSV}'
WITH (FORMAT csv, HEADER true, DELIMITER '${DELIMITER}', ENCODING 'UTF8');

UPDATE stg_user_geo
SET country = NULLIF(BTRIM(country), ''),
    city    = NULLIF(BTRIM(city), ''),
    school  = NULLIF(BTRIM(school), '');

-- Basic checks
SELECT count(*) AS rows_total, count(DISTINCT user_id) AS users_unique
FROM stg_user_geo;

SELECT count(*) AS duplicated_user_ids
FROM (
  SELECT user_id
  FROM stg_user_geo
  GROUP BY user_id
  HAVING count(*) > 1
) d;

SELECT count(*) AS missing_users
FROM stg_user_geo s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL;

DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stg_user_geo
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CSV contains duplicated user_id values';
  END IF;
END
\$\$;

SELECT count(*) AS will_update
FROM users u
JOIN stg_user_geo s ON s.user_id = u.id
WHERE (u.country, u.city, u.school) IS DISTINCT FROM (s.country, s.city, s.school);

WITH updated AS (
  UPDATE users u
  SET country = s.country,
      city = s.city,
      school = s.school
  FROM stg_user_geo s
  WHERE u.id = s.user_id
    AND (u.country, u.city, u.school) IS DISTINCT FROM (s.country, s.city, s.school)
  RETURNING u.id
)
SELECT count(*) AS updated_rows FROM updated;
SQL
)

if [[ "${MODE}" == "apply" ]]; then
  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
${SQL_BODY}
COMMIT;
SQL
  echo "Apply finished (changes committed)."
else
  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
${SQL_BODY}
ROLLBACK;
SQL
  echo "Dry-run finished (all changes rolled back)."
fi

echo "Done."
