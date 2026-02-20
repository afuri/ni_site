#!/usr/bin/env bash
set -euo pipefail

# Regrade attempts for selected short_text tasks.
# Matching rules:
#  1) Numeric match: answer contains numeric value from task payload.expected
#     as a standalone number token (allows dot/comma decimal separator).
#  2) Optional word match (case-insensitive) for specific task ids.
#
# Usage:
#   DRY_RUN=1 ./regrade_task50_51_words.sh                  # preview only
#   ./regrade_task50_51_words.sh                            # apply changes
#   REPORT_DIR=./reports ./regrade_task50_51_words.sh       # custom report dir

DRY_RUN="${DRY_RUN:-0}"
REPORT_DIR="${REPORT_DIR:-./reports}"
RUN_TS="$(date +%F_%H-%M-%S)"
MODE_TAG="apply"
if [[ "${DRY_RUN}" == "1" ]]; then
  MODE_TAG="dry_run"
fi
REPORT_PREFIX="${REPORT_DIR}/regrade_task50_51_${MODE_TAG}_${RUN_TS}"
SUMMARY_CSV="${REPORT_PREFIX}_summary.csv"
ATTEMPTS_CSV="${REPORT_PREFIX}_attempts_to_fix.csv"
DETAILS_CSV="${REPORT_PREFIX}_details.csv"

SQL_COMMON_CTE=$(cat <<'SQL'
WITH cfg(task_id, word_regex) AS (
  VALUES
    (39, '(^|\\s)(четыре|четвертая|четвертой)(\\s|$)'),
    (40, '(^|\\s)тринадцать(\\s|$)'),
    (41, NULL),
    (42, '(^|\\s)четыре(\\s|$)'),
    (44, '(^|\\s)(четыре|четвертая|четвертой)(\\s|$)'),
    (50, '(^|\\s)четыре(\\s|$)'),
    (51, '(^|\\s)три(\\s|$)'),
    (53, NULL),
    (54, NULL),
    (55, NULL),
    (56, NULL),
    (57, NULL),
    (58, NULL),
    (59, NULL),
    (60, NULL),
    (61, '(^|\\s)четыре(\\s|$)'),
    (63, '(^|\\s)(три|трех|трёх)(\\s|$)'),
    (66, '(^|\\s)семь(\\s|$)'),
    (67, '(^|\\s)четыре(\\s|$)'),
    (68, '(^|\\s)пять(\\s|$)'),
    (71, '(^|\\s)(шестнадцать|шестнадцати)(\\s|$)')
),
candidates AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload->>'expected' AS expected_text,
    cfg.word_regex,
    ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN cfg
    ON cfg.task_id = ans.task_id
  JOIN tasks t
    ON t.id = ans.task_id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ans.task_id
  WHERE a.status IN ('submitted', 'expired')
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    c.*,
    regexp_match(COALESCE(c.expected_text, ''), '([+-]?[0-9]+(?:[.,][0-9]+)?)') AS exp_num_match
  FROM candidates c
),
matched AS (
  SELECT
    p.*,
    CASE
      WHEN p.task_id = 50 THEN p.answer_text ~* '(^|[^0-9])4(?:[.,]0+)?([^0-9]|$)'
      WHEN p.task_id = 51 THEN p.answer_text ~* '(^|[^0-9])3(?:[.,]0+)?([^0-9]|$)'
      WHEN p.exp_num_match IS NULL THEN FALSE
      ELSE (
        p.answer_text ~* (
          '(^|[^0-9])' ||
          regexp_replace(replace(p.exp_num_match[1], '.', '[.,]'), '([+\\-])', '\\\\1', 'g') ||
          '([^0-9]|$)'
        )
      )
    END AS numeric_match,
    CASE
      WHEN p.word_regex IS NULL THEN FALSE
      ELSE p.answer_text ~* p.word_regex
    END AS word_match
  FROM parsed p
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
  (SELECT COUNT(*) FROM final_match) AS total_matched_rows_all_tasks,
  (SELECT COUNT(DISTINCT attempt_id) FROM final_match) AS total_matched_attempts_all_tasks,
  (SELECT COUNT(*) FROM to_fix_attempts) AS total_attempts_requiring_fix,
  (SELECT COUNT(*) FROM candidates) AS rows_in_scope,
  (SELECT COUNT(*) FROM final_match) AS matched_rows,
  (SELECT COUNT(DISTINCT attempt_id) FROM final_match) AS affected_attempts,
  (SELECT COUNT(*) FROM to_fix_rows) AS would_change_rows,
  (SELECT COUNT(*) FROM to_fix_attempts) AS would_change_attempts
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
  task_id,
  expected_text,
  CASE WHEN exp_num_match IS NULL THEN NULL ELSE exp_num_match[1] END AS expected_number_extracted,
  answer_text,
  numeric_match,
  word_match,
  (numeric_match OR word_match) AS is_final_match
FROM matched
ORDER BY attempt_id, task_id
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
