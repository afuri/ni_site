#!/usr/bin/env bash
set -euo pipefail

# Build a consolidated CSV report for attempts listed in input CSV.
# Input CSV must contain column: attempt_id
#
# Usage:
#   ./export_attempts_summary_from_list.sh \
#     ./reports/regrade_task50_51_dry_run_2026-02-20_11-19-55_attempts_to_fix.csv
#
# Optional second arg: output CSV path

INPUT_CSV="${1:-./reports/regrade_task50_51_dry_run_2026-02-20_11-19-55_attempts_to_fix.csv}"
RUN_TS="$(date +%F_%H-%M-%S)"
OUTPUT_CSV="${2:-./reports/attempts_summary_${RUN_TS}.csv}"

if [[ ! -f "${INPUT_CSV}" ]]; then
  echo "Input CSV not found: ${INPUT_CSV}" >&2
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_CSV}")"

TMP_CONTAINER_CSV="/tmp/attempt_ids_${RUN_TS}_$$.csv"
TMP_OUT="${OUTPUT_CSV}.tmp"

cleanup() {
  docker compose exec -T db sh -lc "rm -f '${TMP_CONTAINER_CSV}'" >/dev/null 2>&1 || true
  rm -f "${TMP_OUT}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose cp "${INPUT_CSV}" "db:${TMP_CONTAINER_CSV}"

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL > "${TMP_OUT}"
CREATE TEMP TABLE tmp_attempt_ids (attempt_id bigint);
\\copy tmp_attempt_ids (attempt_id) FROM '${TMP_CONTAINER_CSV}' WITH (FORMAT csv, HEADER true);

COPY (
WITH ids AS (
  SELECT DISTINCT attempt_id::int AS attempt_id
  FROM tmp_attempt_ids
  WHERE attempt_id IS NOT NULL
),
base AS (
  SELECT
    a.id,
    a.user_id,
    a.olympiad_id,
    o.title AS olympiad_title,
    u.login AS user_login,
    NULLIF(TRIM(CONCAT_WS(' ', u.surname, u.name, u.father_name)), '') AS user_full_name,
    CASE
      WHEN u.gender IS NULL THEN NULL
      ELSE u.gender::text
    END AS gender,
    u.class_grade,
    u.city,
    u.school,
    a.started_at,
    a.graded_at AS completed_at,
    a.duration_sec,
    a.score_total,
    a.score_max,
    CASE
      WHEN COALESCE(a.score_max, 0) > 0
        THEN ROUND((a.score_total::numeric * 100.0) / a.score_max)::int
      ELSE 0
    END AS percent
  FROM ids i
  JOIN attempts a ON a.id = i.attempt_id
  JOIN users u ON u.id = a.user_id
  JOIN olympiads o ON o.id = a.olympiad_id
),
teachers AS (
  SELECT
    b.id AS attempt_id,
    (
      SELECT STRING_AGG(tn.teacher_name, '; ' ORDER BY tn.teacher_name)
      FROM (
        SELECT DISTINCT teacher_name
        FROM (
          SELECT NULLIF(TRIM(CONCAT_WS(' ', tu.surname, tu.name, tu.father_name)), '') AS teacher_name
          FROM teacher_students ts
          JOIN users tu ON tu.id = ts.teacher_id
          WHERE ts.student_id = b.user_id
            AND ts.status = 'confirmed'
          UNION ALL
          SELECT NULLIF(TRIM(j.value->>'full_name'), '') AS teacher_name
          FROM JSONB_ARRAY_ELEMENTS(COALESCE((SELECT u2.manual_teachers FROM users u2 WHERE u2.id = b.user_id), '[]'::jsonb)) j(value)
        ) raw_names
        WHERE teacher_name IS NOT NULL
      ) tn
    ) AS teachers
  FROM base b
)
SELECT
  b.id,
  b.user_id,
  b.olympiad_id,
  b.olympiad_title,
  b.user_login,
  b.user_full_name,
  b.gender,
  b.class_grade,
  b.city,
  b.school,
  t.teachers,
  b.started_at,
  b.completed_at,
  b.duration_sec,
  b.score_total,
  b.score_max,
  b.percent
FROM base b
LEFT JOIN teachers t
  ON t.attempt_id = b.id
ORDER BY b.id
) TO STDOUT WITH CSV HEADER;
SQL

# UTF-8 BOM for correct Cyrillic rendering in Excel
printf '\xEF\xBB\xBF' > "${OUTPUT_CSV}"
cat "${TMP_OUT}" >> "${OUTPUT_CSV}"

echo "Report created: ${OUTPUT_CSV}"
