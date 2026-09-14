#!/usr/bin/env bash
set -Eeuo pipefail

MODE="--dry-run"
SCHOOLS=""
USERS=""
BATCH_ID=""
COMPOSE_FILE="docker-compose.local.yml"
REVIEW_OUTPUT="temporary/user_region_review.csv"
REGION_OVERRIDES=""

usage() {
  cat <<'EOF'
Usage:
  import_school_directory.sh \
    --schools temporary/ni_schools.csv \
    --users temporary/user_school.csv \
    --batch-id <id> \
    [--dry-run|--apply] \
    [--compose-file docker-compose.local.yml] \
    [--review-output temporary/user_region_review.csv] \
    [--region-overrides temporary/user_region_overrides.csv]

Dry-run is the default. The script never truncates the legacy directory.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --schools) SCHOOLS="${2:-}"; shift 2 ;;
    --users) USERS="${2:-}"; shift 2 ;;
    --batch-id) BATCH_ID="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 ;;
    --review-output) REVIEW_OUTPUT="${2:-}"; shift 2 ;;
    --region-overrides) REGION_OVERRIDES="${2:-}"; shift 2 ;;
    --dry-run) MODE="--dry-run"; shift ;;
    --apply) MODE="--apply"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$SCHOOLS" || -z "$USERS" || -z "$BATCH_ID" ]]; then
  usage
  exit 2
fi
if [[ ! "$BATCH_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid batch ID." >&2
  exit 2
fi
if [[ ! -f "$COMPOSE_FILE" || ! -f "$SCHOOLS" || ! -f "$USERS" ]]; then
  echo "Compose file or CSV input is missing." >&2
  exit 2
fi

absolute_file() {
  local directory
  directory="$(cd "$(dirname "$1")" && pwd)"
  printf '%s/%s' "$directory" "$(basename "$1")"
}

SCHOOLS_ABS="$(absolute_file "$SCHOOLS")"
USERS_ABS="$(absolute_file "$USERS")"
REVIEW_DIR="$(dirname "$REVIEW_OUTPUT")"
mkdir -p "$REVIEW_DIR"
REVIEW_DIR_ABS="$(cd "$REVIEW_DIR" && pwd)"
REVIEW_NAME="$(basename "$REVIEW_OUTPUT")"

OVERRIDE_ARGS=()
OVERRIDE_MOUNT=()
if [[ -n "$REGION_OVERRIDES" ]]; then
  if [[ ! -f "$REGION_OVERRIDES" ]]; then
    echo "Region overrides file is missing: $REGION_OVERRIDES" >&2
    exit 2
  fi
  REGION_OVERRIDES_ABS="$(absolute_file "$REGION_OVERRIDES")"
  OVERRIDE_MOUNT=(-v "$REGION_OVERRIDES_ABS:/imports/user_region_overrides.csv:ro")
  OVERRIDE_ARGS=(--region-overrides /imports/user_region_overrides.csv)
fi

if [[ -z "$(docker compose -f "$COMPOSE_FILE" ps -q db)" ]]; then
  echo "The db service is not running for compose file: $COMPOSE_FILE" >&2
  exit 2
fi

echo "Mode: ${MODE#--}"
echo "Batch ID: $BATCH_ID"

docker compose -f "$COMPOSE_FILE" run --rm -T --no-deps \
  -v "$SCHOOLS_ABS:/imports/ni_schools.csv:ro" \
  -v "$USERS_ABS:/imports/user_school.csv:ro" \
  -v "$REVIEW_DIR_ABS:/import-output" \
  "${OVERRIDE_MOUNT[@]}" \
  api python /app/scripts/load_school.py \
    --schools /imports/ni_schools.csv \
    --users /imports/user_school.csv \
    --batch-id "$BATCH_ID" \
    "$MODE" \
    --review-output "/import-output/$REVIEW_NAME" \
    "${OVERRIDE_ARGS[@]}"
