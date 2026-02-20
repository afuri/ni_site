#!/usr/bin/env bash
set -euo pipefail

# Regrade attempts for short_text task 37.
# Match rules:
#   - numeric token 9 (e.g. "9", "9-й", "в 9 клетке")
#   - words: "девятая", "девять", "девятой" (case-insensitive)
#
# Usage:
#   DRY_RUN=1 ./regrade_task37_words.sh
#   ./regrade_task37_words.sh
#   REPORT_DIR=./reports ./regrade_task37_words.sh

DRY_RUN="${DRY_RUN:-0}"
REPORT_DIR="${REPORT_DIR:-./reports}"
RUN_TS="$(date +%F_%H-%M-%S)"
MODE_TAG="apply"
if [[ "${DRY_RUN}" == "1" ]]; then
  MODE_TAG="dry_run"
fi

REPORT_PREFIX="${REPORT_DIR}/regrade_task37_${MODE_TAG}_${RUN_TS}"
SUMMARY_CSV="${REPORT_PREFIX}_summary.csv"
ATTEMPTS_CSV="${REPORT_PREFIX}_attempts_to_fix.csv"
DETAILS_CSV="${REPORT_PREFIX}_details.csv"

SQL_COMMON_CTE=$(cat <<'SQL'
WITH candidates AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ans.task_id
  WHERE a.status IN ('submitted', 'expired')
    AND ans.task_id = 37
    AND ans.answer_payload ? 'text'
),
matched AS (
  SELECT
    c.*,
    (c.answer_text ~* '(^|[^0-9])9(?:[.,]0+)?([^0-9]|$)') AS numeric_match,
    (c.answer_text ~* '(^|\\s)(девятая|девять|девятой)(\\s|$)') AS word_match
  FROM candidates c
),
final_match AS (
  SELECT *
  FROM matched
  WHERE numeric_match OR word_match
),
to_fix_rows AS (
  SELECT
    m.attempt_id,
    m.olympiad_id,
    m.task_id,
    m.max_score
  FROM final_match m
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = m.attempt_id
   AND g.task_id = m.task_id
  WHERE g.attempt_id IS NULL
     OR g.is_correct IS DISTINCT FROM TRUE
     OR g.score IS DISTINCT FROM m.max_score
),
to_fix_attempts AS (
  SELECT DISTINCT attempt_id, olympiad_id
  FROM to_fix_rows
)
SQL
)

generate_csv_reports() {
  mkdir -p "${REPORT_DIR}"

  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL > "${SUMMARY_CSV}"
COPY (
${SQL_COMMON_CTE}
SELECT
  (SELECT COUNT(*) FROM final_match) AS total_matched_rows,
  (SELECT COUNT(DISTINCT attempt_id) FROM final_match) AS total_matched_attempts,
  (SELECT COUNT(*) FROM to_fix_attempts) AS total_attempts_requiring_fix,
  (SELECT COUNT(*) FROM candidates) AS rows_in_scope,
  (SELECT COUNT(*) FROM to_fix_rows) AS would_change_rows
) TO STDOUT WITH CSV HEADER;
SQL

  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL > "${ATTEMPTS_CSV}"
COPY (
${SQL_COMMON_CTE}
SELECT attempt_id
FROM to_fix_attempts
ORDER BY attempt_id
) TO STDOUT WITH CSV HEADER;
SQL

  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL > "${DETAILS_CSV}"
COPY (
${SQL_COMMON_CTE}
SELECT
  attempt_id,
  answer_text,
  numeric_match,
  word_match,
  (numeric_match OR word_match) AS is_final_match
FROM matched
ORDER BY attempt_id
) TO STDOUT WITH CSV HEADER;
SQL
}

generate_csv_reports
echo "Report saved:"
echo "  ${SUMMARY_CSV}"
echo "  ${ATTEMPTS_CSV}"
echo "  ${DETAILS_CSV}"

if [[ "${DRY_RUN}" == "1" ]]; then
  exit 0
fi

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
BEGIN;

CREATE TEMP TABLE tmp_regrade_fix_rows ON COMMIT DROP AS
${SQL_COMMON_CTE}
SELECT attempt_id, olympiad_id, task_id, max_score
FROM to_fix_rows;

CREATE TEMP TABLE tmp_regrade_fix_attempts ON COMMIT DROP AS
SELECT DISTINCT attempt_id, olympiad_id
FROM tmp_regrade_fix_rows;

INSERT INTO attempt_task_grades (attempt_id, task_id, is_correct, score, max_score, graded_at)
SELECT r.attempt_id, r.task_id, TRUE, r.max_score, r.max_score, now()
FROM tmp_regrade_fix_rows r
ON CONFLICT (attempt_id, task_id) DO UPDATE
SET is_correct = EXCLUDED.is_correct,
    score = EXCLUDED.score,
    max_score = EXCLUDED.max_score,
    graded_at = COALESCE(attempt_task_grades.graded_at, EXCLUDED.graded_at);

WITH scores AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    COALESCE(SUM(g.score), 0) AS score_total
  FROM attempts a
  JOIN tmp_regrade_fix_attempts t
    ON t.attempt_id = a.id
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = a.id
  GROUP BY a.id, a.olympiad_id
),
maxes AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    COALESCE(SUM(ot.max_score), 0) AS score_max
  FROM attempts a
  JOIN tmp_regrade_fix_attempts t
    ON t.attempt_id = a.id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
  GROUP BY a.id, a.olympiad_id
)
UPDATE attempts a
SET score_total = s.score_total,
    score_max = m.score_max,
    passed = CASE
      WHEN m.score_max <= 0 THEN FALSE
      ELSE s.score_total >= CEIL(m.score_max * o.pass_percent / 100.0)
    END,
    graded_at = COALESCE(a.graded_at, now())
FROM scores s
JOIN maxes m
  ON m.attempt_id = s.attempt_id
JOIN olympiads o
  ON o.id = s.olympiad_id
WHERE a.id = s.attempt_id;

SELECT attempt_id
FROM tmp_regrade_fix_attempts
ORDER BY attempt_id;

SELECT COUNT(*) AS total_attempts_fixed
FROM tmp_regrade_fix_attempts;

COMMIT;
SQL
