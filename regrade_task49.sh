#!/usr/bin/env bash
set -euo pipefail

# Regrade attempts for task 49 where correct choices are B or C.
# Adjust these if needed before running.
TASK_ID=49
ID_FROM=2299
ID_TO=4183
DRY_RUN="${DRY_RUN:-0}"

if [[ "${DRY_RUN}" == "1" ]]; then
  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
WITH target AS (
  SELECT a.id AS attempt_id, ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
   AND ans.task_id = ${TASK_ID}
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ${TASK_ID}
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND (ans.answer_payload->>'choice_id') IN ('B','C')
),
existing AS (
  SELECT g.attempt_id
  FROM attempt_task_grades g
  JOIN target t ON t.attempt_id = g.attempt_id
  WHERE g.task_id = ${TASK_ID}
),
sums AS (
  SELECT g.attempt_id,
         SUM(g.score) AS score_total,
         SUM(g.max_score) AS score_max
  FROM attempt_task_grades g
  JOIN target t ON t.attempt_id = g.attempt_id
  GROUP BY g.attempt_id
)
SELECT
  (SELECT COUNT(*) FROM target) AS target_attempts,
  (SELECT COUNT(*) FROM existing) AS already_graded_task,
  (SELECT COUNT(*) FROM target) - (SELECT COUNT(*) FROM existing) AS would_insert_task_grades,
  (SELECT COUNT(*) FROM sums) AS attempts_to_recalc;
SQL
  exit 0
fi

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
BEGIN;

WITH target AS (
  SELECT a.id AS attempt_id, ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
   AND ans.task_id = ${TASK_ID}
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ${TASK_ID}
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND (ans.answer_payload->>'choice_id') IN ('B','C')
),
upserted AS (
  INSERT INTO attempt_task_grades (attempt_id, task_id, is_correct, score, max_score, graded_at)
  SELECT attempt_id, ${TASK_ID}, TRUE, max_score, max_score, now()
  FROM target
  ON CONFLICT (attempt_id, task_id) DO UPDATE
  SET is_correct = EXCLUDED.is_correct,
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      graded_at = COALESCE(attempt_task_grades.graded_at, EXCLUDED.graded_at)
  RETURNING attempt_id
),
sums AS (
  SELECT g.attempt_id,
         SUM(g.score) AS score_total,
         SUM(g.max_score) AS score_max
  FROM attempt_task_grades g
  JOIN target t ON t.attempt_id = g.attempt_id
  GROUP BY g.attempt_id
)
UPDATE attempts a
SET score_total = s.score_total,
    score_max = s.score_max,
    passed = CASE
      WHEN s.score_max <= 0 THEN FALSE
      ELSE s.score_total >= CEIL(s.score_max * o.pass_percent / 100.0)
    END,
    graded_at = COALESCE(a.graded_at, now())
FROM sums s
JOIN olympiads o ON o.id = a.olympiad_id
WHERE a.id = s.attempt_id;

COMMIT;
SQL
