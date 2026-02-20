#!/usr/bin/env bash
set -euo pipefail

# Regrade attempts for short_text tasks:
#   - task 51: accept numeric answer "3" (optionally with decimal zeros and optional unit, e.g. "3 кг")
#              OR word "три" (case-insensitive)
#   - task 50: accept numeric answer "4" (optionally with decimal zeros and optional unit)
#              OR word "четыре" (case-insensitive)
#
# Usage:
#   DRY_RUN=1 ./regrade_task50_51_words.sh   # preview only
#   ./regrade_task50_51_words.sh             # apply changes

DRY_RUN="${DRY_RUN:-0}"

if [[ "${DRY_RUN}" == "1" ]]; then
  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<'SQL'
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
    AND ans.task_id IN (50, 51)
    AND ans.answer_payload ? 'text'
),
matched AS (
  SELECT *
  FROM candidates c
  WHERE
    (
      c.task_id = 51
      AND (
        c.answer_text ~* '^\s*три\s*$'
        OR c.answer_text ~* '^\s*3(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
    OR
    (
      c.task_id = 50
      AND (
        c.answer_text ~* '^\s*четыре\s*$'
        OR c.answer_text ~* '^\s*4(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
),
to_fix_rows AS (
  SELECT
    m.attempt_id,
    m.task_id,
    m.max_score
  FROM matched m
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = m.attempt_id
   AND g.task_id = m.task_id
  WHERE g.attempt_id IS NULL
     OR g.is_correct IS DISTINCT FROM TRUE
     OR g.score IS DISTINCT FROM m.max_score
)
SELECT
  (SELECT COUNT(*) FROM candidates) AS rows_in_scope,
  (SELECT COUNT(*) FROM matched) AS matched_rows,
  (SELECT COUNT(DISTINCT attempt_id) FROM matched) AS affected_attempts,
  (SELECT COUNT(*) FROM to_fix_rows) AS would_change_rows,
  (SELECT COUNT(DISTINCT attempt_id) FROM to_fix_rows) AS would_change_attempts;
SQL

  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<'SQL'
WITH candidates AS (
  SELECT
    a.id AS attempt_id,
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
    AND ans.task_id IN (50, 51)
    AND ans.answer_payload ? 'text'
),
matched AS (
  SELECT *
  FROM candidates c
  WHERE
    (
      c.task_id = 51
      AND (
        c.answer_text ~* '^\s*три\s*$'
        OR c.answer_text ~* '^\s*3(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
    OR
    (
      c.task_id = 50
      AND (
        c.answer_text ~* '^\s*четыре\s*$'
        OR c.answer_text ~* '^\s*4(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
),
to_fix_attempts AS (
  SELECT DISTINCT m.attempt_id
  FROM matched m
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = m.attempt_id
   AND g.task_id = m.task_id
  WHERE g.attempt_id IS NULL
     OR g.is_correct IS DISTINCT FROM TRUE
     OR g.score IS DISTINCT FROM m.max_score
)
SELECT attempt_id
FROM to_fix_attempts
ORDER BY attempt_id;

SELECT COUNT(*) AS total_attempts_to_fix
FROM to_fix_attempts;
SQL
  exit 0
fi

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

CREATE TEMP TABLE tmp_regrade_fix_rows ON COMMIT DROP AS
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
    AND ans.task_id IN (50, 51)
    AND ans.answer_payload ? 'text'
),
matched AS (
  SELECT *
  FROM candidates c
  WHERE
    (
      c.task_id = 51
      AND (
        c.answer_text ~* '^\s*три\s*$'
        OR c.answer_text ~* '^\s*3(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
    OR
    (
      c.task_id = 50
      AND (
        c.answer_text ~* '^\s*четыре\s*$'
        OR c.answer_text ~* '^\s*4(?:[.,]0+)?(?:\s*[[:alpha:]А-Яа-яЁё]+\.?)?\s*$'
      )
    )
)
SELECT
  m.attempt_id,
  m.olympiad_id,
  m.task_id,
  m.max_score
FROM matched m
LEFT JOIN attempt_task_grades g
  ON g.attempt_id = m.attempt_id
 AND g.task_id = m.task_id
WHERE g.attempt_id IS NULL
   OR g.is_correct IS DISTINCT FROM TRUE
   OR g.score IS DISTINCT FROM m.max_score;

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
