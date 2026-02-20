#!/usr/bin/env bash
set -euo pipefail

# Build a consolidated CSV report for ALL attempts.
# This variant does NOT include teachers (confirmed links + manual teachers).
#
# Usage:
#   ./export_attempts_summary_no_teachers_from_list.sh
#   ./export_attempts_summary_no_teachers_from_list.sh ./reports/summary_no_teachers.csv

RUN_TS="$(date +%F_%H-%M-%S)"
OUTPUT_CSV="${1:-./reports/attempts_summary_no_teachers_${RUN_TS}.csv}"

mkdir -p "$(dirname "${OUTPUT_CSV}")"

TMP_OUT="${OUTPUT_CSV}.tmp"

cleanup() {
  rm -f "${TMP_OUT}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL > "${TMP_OUT}"
COPY (
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
FROM attempts a
JOIN users u ON u.id = a.user_id
JOIN olympiads o ON o.id = a.olympiad_id
ORDER BY a.id
) TO STDOUT WITH CSV HEADER;
SQL

# UTF-8 BOM for correct Cyrillic rendering in Excel
printf '\xEF\xBB\xBF' > "${OUTPUT_CSV}"
cat "${TMP_OUT}" >> "${OUTPUT_CSV}"

echo "Report created: ${OUTPUT_CSV}"
