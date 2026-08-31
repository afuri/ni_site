#!/usr/bin/env bash
set -Eeuo pipefail

# Promote every student with class_grade 0..10 by one grade.
# Grade 11, NULL, and invalid values are reported but left unchanged.
#
# A batch ID makes the operation auditable and prevents the same promotion
# batch from being applied more than once.
#
# Examples:
#   ./manual_scripts/promote_student_grades.sh --batch-id 2026-2027 --dry-run
#   ./manual_scripts/promote_student_grades.sh --batch-id 2026-2027 --apply

MODE="dry-run"
BATCH_ID=""

usage() {
  cat <<'EOF'
Usage:
  promote_student_grades.sh --batch-id <id> [--dry-run|--apply]

Options:
  --batch-id <id>  Unique promotion label, for example 2026-2027 (required).
  --dry-run        Show the planned changes and roll them back (default).
  --apply          Apply the changes and write audit rows to user_changes.
  -h, --help       Show this help.

Behavior:
  - users with role=student and class_grade 0..10 are promoted by one grade;
  - grade 11, NULL, and values outside 0..11 are not changed;
  - an already applied batch ID cannot be applied again.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --batch-id)
      BATCH_ID="${2:-}"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
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

if [[ -z "${BATCH_ID}" ]]; then
  echo "--batch-id is required." >&2
  usage
  exit 2
fi

if [[ ! "${BATCH_ID}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid batch ID. Use only letters, digits, dot, underscore, and hyphen." >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH." >&2
  exit 2
fi

DB_CID="$(docker compose ps -q db)"
if [[ -z "${DB_CID}" ]]; then
  echo "The docker compose db service is not running." >&2
  exit 2
fi

APPLY_MODE="false"
if [[ "${MODE}" == "apply" ]]; then
  APPLY_MODE="true"
fi

echo "Mode: ${MODE}"
echo "Batch ID: ${BATCH_ID}"
echo "Students in grade 11, with NULL grade, or with an invalid grade will be skipped."

docker compose exec -T db psql \
  -U postgres \
  -d ni_site \
  -v ON_ERROR_STOP=1 \
  -v batch_id="${BATCH_ID}" \
  -v apply_mode="${APPLY_MODE}" <<'SQL'
\pset pager off

BEGIN;

-- Do not allow two promotion scripts to modify students concurrently.
SELECT pg_advisory_xact_lock(hashtext('manual_scripts.promote_student_grades'));

CREATE TEMP TABLE promotion_params AS
SELECT :'batch_id'::text AS batch_id;

DO $do$
DECLARE
  v_batch_id text;
BEGIN
  SELECT batch_id INTO v_batch_id FROM promotion_params;

  IF EXISTS (
    SELECT 1
    FROM user_changes
    WHERE action = 'annual_grade_promotion'
      AND details->>'batch_id' = v_batch_id
  ) THEN
    RAISE EXCEPTION 'Promotion batch % has already been applied', v_batch_id;
  END IF;
END
$do$;

SELECT
  class_grade AS old_grade,
  class_grade + 1 AS new_grade,
  COUNT(*) AS students
FROM users
WHERE role = 'student'
  AND class_grade BETWEEN 0 AND 10
GROUP BY class_grade
ORDER BY class_grade;

SELECT
  COUNT(*) FILTER (WHERE class_grade BETWEEN 0 AND 10) AS will_promote,
  COUNT(*) FILTER (WHERE class_grade = 11) AS grade_11_skipped,
  COUNT(*) FILTER (WHERE class_grade IS NULL) AS null_grade_skipped,
  COUNT(*) FILTER (WHERE class_grade < 0 OR class_grade > 11) AS invalid_grade_skipped
FROM users
WHERE role = 'student';

CREATE TEMP TABLE promotion_targets ON COMMIT DROP AS
SELECT
  id AS user_id,
  class_grade AS old_grade,
  class_grade + 1 AS new_grade
FROM users
WHERE role = 'student'
  AND class_grade BETWEEN 0 AND 10;

-- Lock exactly the rows represented by the preview above without printing IDs.
DO $do$
BEGIN
  PERFORM u.id
  FROM users u
  JOIN promotion_targets t ON t.user_id = u.id
  FOR UPDATE OF u;
END
$do$;

WITH updated AS (
  UPDATE users u
  SET class_grade = t.new_grade
  FROM promotion_targets t
  WHERE u.id = t.user_id
    AND u.role = 'student'
    AND u.class_grade = t.old_grade
  RETURNING u.id, t.old_grade, t.new_grade
), audited AS (
  INSERT INTO user_changes (
    actor_user_id,
    target_user_id,
    action,
    details,
    created_at
  )
  SELECT
    NULL,
    updated.id,
    'annual_grade_promotion',
    jsonb_build_object(
      'batch_id', (SELECT batch_id FROM promotion_params),
      'old_grade', updated.old_grade,
      'new_grade', updated.new_grade,
      'source', 'manual_scripts/promote_student_grades.sh'
    ),
    NOW()
  FROM updated
  RETURNING target_user_id
)
SELECT COUNT(*) AS changed_and_audited FROM audited;

\if :apply_mode
COMMIT;
\echo 'Promotion applied and committed.'
\else
ROLLBACK;
\echo 'Dry-run completed; all changes were rolled back.'
\endif
SQL

echo "Done."
