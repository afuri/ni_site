#!/usr/bin/env bash
set -euo pipefail

# Targeted regrade for grade-3 attempts where answers include numeric value + units.
# Scope:
#   - attempts: 4184..6066
#   - tasks:    63,66,67,68,71
# Rule:
#   - if saved answer text matches "number + unit suffix", compare numeric part with expected.
#   - for subtype=float uses epsilon (payload.epsilon, default 0.01), otherwise exact numeric equality.
# Usage:
#   DRY_RUN=1 ./regrade_task_units_3class.sh   # preview only
#   ./regrade_task_units_3class.sh             # apply changes

ID_FROM=4184
ID_TO=6066
TASK_IDS="63,66,67,68,71,118,119,120,121 "
DRY_RUN="${DRY_RUN:-0}"

if [[ "${DRY_RUN}" == "1" ]]; then
  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
WITH raw AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload AS task_payload,
    t.payload->>'expected' AS expected_text,
    LOWER(COALESCE(t.payload->>'subtype', '')) AS subtype,
    ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN tasks t
    ON t.id = ans.task_id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ans.task_id
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND a.status IN ('submitted', 'expired')
    AND ans.task_id IN (${TASK_IDS})
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    r.*,
    regexp_match(r.answer_text, '^\s*([+-]?\d+(?:[.,]\d+)?)\s*(\S.*)$') AS ans_match,
    regexp_match(COALESCE(r.expected_text, ''), '^\s*([+-]?\d+(?:[.,]\d+)?)\s*$') AS exp_match
  FROM raw r
),
target AS (
  SELECT
    p.attempt_id,
    p.olympiad_id,
    p.task_id,
    p.answer_text,
    p.expected_text,
    p.subtype,
    p.max_score,
    REPLACE(p.ans_match[1], ',', '.')::numeric AS got_num,
    REPLACE(p.exp_match[1], ',', '.')::numeric AS exp_num,
    CASE
      WHEN p.subtype = 'float' THEN COALESCE(NULLIF(p.task_payload->>'epsilon', '')::numeric, 0.01::numeric)
      ELSE 0::numeric
    END AS eps_val
  FROM parsed p
  WHERE p.ans_match IS NOT NULL
    AND p.exp_match IS NOT NULL
    AND BTRIM(COALESCE(p.ans_match[2], '')) <> ''
),
matched AS (
  SELECT
    t.*,
    CASE
      WHEN t.subtype = 'float' THEN ABS(t.got_num - t.exp_num) <= t.eps_val
      ELSE t.got_num = t.exp_num
    END AS is_match
  FROM target t
),
final_target AS (
  SELECT
    m.attempt_id,
    m.olympiad_id,
    m.task_id,
    m.max_score
  FROM matched m
  WHERE m.is_match
),
existing AS (
  SELECT
    f.attempt_id,
    f.task_id,
    f.max_score,
    COALESCE(g.is_correct, FALSE) AS existing_is_correct,
    COALESCE(g.score, -1) AS existing_score
  FROM final_target f
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = f.attempt_id
   AND g.task_id = f.task_id
)
SELECT
  (SELECT COUNT(*) FROM raw) AS raw_rows_in_scope,
  (SELECT COUNT(*) FROM parsed WHERE ans_match IS NOT NULL) AS rows_with_number_and_suffix,
  (SELECT COUNT(*) FROM final_target) AS matched_rows,
  (SELECT COUNT(DISTINCT attempt_id) FROM final_target) AS affected_attempts,
  (SELECT COUNT(*) FROM existing WHERE existing_is_correct AND existing_score = max_score) AS already_full_credit,
  (SELECT COUNT(*) FROM existing WHERE NOT (existing_is_correct AND existing_score = max_score)) AS would_change_rows;
SQL

  docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
WITH raw AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload AS task_payload,
    t.payload->>'expected' AS expected_text,
    LOWER(COALESCE(t.payload->>'subtype', '')) AS subtype,
    ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN tasks t
    ON t.id = ans.task_id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ans.task_id
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND a.status IN ('submitted', 'expired')
    AND ans.task_id IN (${TASK_IDS})
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    r.*,
    regexp_match(r.answer_text, '^\s*([+-]?\d+(?:[.,]\d+)?)\s*(\S.*)$') AS ans_match,
    regexp_match(COALESCE(r.expected_text, ''), '^\s*([+-]?\d+(?:[.,]\d+)?)\s*$') AS exp_match
  FROM raw r
),
target AS (
  SELECT
    p.attempt_id,
    p.task_id,
    p.answer_text,
    p.expected_text,
    p.subtype,
    REPLACE(p.ans_match[1], ',', '.')::numeric AS got_num,
    REPLACE(p.exp_match[1], ',', '.')::numeric AS exp_num,
    CASE
      WHEN p.subtype = 'float' THEN COALESCE(NULLIF(p.task_payload->>'epsilon', '')::numeric, 0.01::numeric)
      ELSE 0::numeric
    END AS eps_val
  FROM parsed p
  WHERE p.ans_match IS NOT NULL
    AND p.exp_match IS NOT NULL
    AND BTRIM(COALESCE(p.ans_match[2], '')) <> ''
),
matched AS (
  SELECT
    t.*,
    CASE
      WHEN t.subtype = 'float' THEN ABS(t.got_num - t.exp_num) <= t.eps_val
      ELSE t.got_num = t.exp_num
    END AS is_match
  FROM target t
)
SELECT
  m.attempt_id,
  m.task_id,
  m.subtype,
  m.answer_text,
  m.expected_text,
  m.got_num,
  m.exp_num,
  m.eps_val,
  m.is_match
FROM matched m
WHERE m.is_match
ORDER BY m.attempt_id, m.task_id
LIMIT 100;
SQL
  exit 0
fi

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
BEGIN;

WITH raw AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload AS task_payload,
    t.payload->>'expected' AS expected_text,
    LOWER(COALESCE(t.payload->>'subtype', '')) AS subtype,
    ot.max_score
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN tasks t
    ON t.id = ans.task_id
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
   AND ot.task_id = ans.task_id
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND a.status IN ('submitted', 'expired')
    AND ans.task_id IN (${TASK_IDS})
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    r.*,
    regexp_match(r.answer_text, '^\s*([+-]?\d+(?:[.,]\d+)?)\s*(\S.*)$') AS ans_match,
    regexp_match(COALESCE(r.expected_text, ''), '^\s*([+-]?\d+(?:[.,]\d+)?)\s*$') AS exp_match
  FROM raw r
),
target AS (
  SELECT
    p.attempt_id,
    p.olympiad_id,
    p.task_id,
    p.subtype,
    p.max_score,
    REPLACE(p.ans_match[1], ',', '.')::numeric AS got_num,
    REPLACE(p.exp_match[1], ',', '.')::numeric AS exp_num,
    CASE
      WHEN p.subtype = 'float' THEN COALESCE(NULLIF(p.task_payload->>'epsilon', '')::numeric, 0.01::numeric)
      ELSE 0::numeric
    END AS eps_val
  FROM parsed p
  WHERE p.ans_match IS NOT NULL
    AND p.exp_match IS NOT NULL
    AND BTRIM(COALESCE(p.ans_match[2], '')) <> ''
),
matched AS (
  SELECT
    t.*,
    CASE
      WHEN t.subtype = 'float' THEN ABS(t.got_num - t.exp_num) <= t.eps_val
      ELSE t.got_num = t.exp_num
    END AS is_match
  FROM target t
),
final_target AS (
  SELECT
    m.attempt_id,
    m.task_id,
    m.max_score
  FROM matched m
  WHERE m.is_match
)
INSERT INTO attempt_task_grades (attempt_id, task_id, is_correct, score, max_score, graded_at)
SELECT
  f.attempt_id,
  f.task_id,
  TRUE,
  f.max_score,
  f.max_score,
  NOW()
FROM final_target f
ON CONFLICT (attempt_id, task_id) DO UPDATE
SET is_correct = EXCLUDED.is_correct,
    score = EXCLUDED.score,
    max_score = EXCLUDED.max_score,
    graded_at = COALESCE(attempt_task_grades.graded_at, EXCLUDED.graded_at);

WITH raw AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload AS task_payload,
    t.payload->>'expected' AS expected_text,
    LOWER(COALESCE(t.payload->>'subtype', '')) AS subtype
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN tasks t
    ON t.id = ans.task_id
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND a.status IN ('submitted', 'expired')
    AND ans.task_id IN (${TASK_IDS})
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    r.*,
    regexp_match(r.answer_text, '^\s*([+-]?\d+(?:[.,]\d+)?)\s*(\S.*)$') AS ans_match,
    regexp_match(COALESCE(r.expected_text, ''), '^\s*([+-]?\d+(?:[.,]\d+)?)\s*$') AS exp_match
  FROM raw r
),
target AS (
  SELECT
    p.attempt_id,
    p.olympiad_id,
    p.task_id,
    p.subtype,
    REPLACE(p.ans_match[1], ',', '.')::numeric AS got_num,
    REPLACE(p.exp_match[1], ',', '.')::numeric AS exp_num,
    CASE
      WHEN p.subtype = 'float' THEN COALESCE(NULLIF(p.task_payload->>'epsilon', '')::numeric, 0.01::numeric)
      ELSE 0::numeric
    END AS eps_val
  FROM parsed p
  WHERE p.ans_match IS NOT NULL
    AND p.exp_match IS NOT NULL
    AND BTRIM(COALESCE(p.ans_match[2], '')) <> ''
),
matched AS (
  SELECT
    t.*,
    CASE
      WHEN t.subtype = 'float' THEN ABS(t.got_num - t.exp_num) <= t.eps_val
      ELSE t.got_num = t.exp_num
    END AS is_match
  FROM target t
),
affected AS (
  SELECT DISTINCT
    m.attempt_id,
    m.olympiad_id
  FROM matched m
  WHERE m.is_match
),
scores AS (
  SELECT
    a.attempt_id,
    COALESCE(SUM(g.score), 0) AS score_total
  FROM affected a
  LEFT JOIN attempt_task_grades g
    ON g.attempt_id = a.attempt_id
  GROUP BY a.attempt_id
),
maxes AS (
  SELECT
    a.attempt_id,
    a.olympiad_id,
    COALESCE(SUM(ot.max_score), 0) AS score_max
  FROM affected a
  JOIN olympiad_tasks ot
    ON ot.olympiad_id = a.olympiad_id
  GROUP BY a.attempt_id, a.olympiad_id
)
UPDATE attempts at
SET score_total = s.score_total,
    score_max = m.score_max,
    passed = CASE
      WHEN m.score_max <= 0 THEN FALSE
      ELSE s.score_total >= CEIL(m.score_max * o.pass_percent / 100.0)
    END,
    graded_at = COALESCE(at.graded_at, NOW())
FROM scores s
JOIN maxes m
  ON m.attempt_id = s.attempt_id
JOIN olympiads o
  ON o.id = m.olympiad_id
WHERE at.id = s.attempt_id;

COMMIT;
SQL

docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 <<SQL
WITH raw AS (
  SELECT
    a.id AS attempt_id,
    a.olympiad_id,
    ans.task_id,
    ans.answer_payload->>'text' AS answer_text,
    t.payload AS task_payload,
    t.payload->>'expected' AS expected_text,
    LOWER(COALESCE(t.payload->>'subtype', '')) AS subtype
  FROM attempts a
  JOIN attempt_answers ans
    ON ans.attempt_id = a.id
  JOIN tasks t
    ON t.id = ans.task_id
  WHERE a.id BETWEEN ${ID_FROM} AND ${ID_TO}
    AND a.status IN ('submitted', 'expired')
    AND ans.task_id IN (${TASK_IDS})
    AND ans.answer_payload ? 'text'
),
parsed AS (
  SELECT
    r.*,
    regexp_match(r.answer_text, '^\s*([+-]?\d+(?:[.,]\d+)?)\s*(\S.*)$') AS ans_match,
    regexp_match(COALESCE(r.expected_text, ''), '^\s*([+-]?\d+(?:[.,]\d+)?)\s*$') AS exp_match
  FROM raw r
),
target AS (
  SELECT
    p.attempt_id,
    p.task_id,
    p.subtype,
    REPLACE(p.ans_match[1], ',', '.')::numeric AS got_num,
    REPLACE(p.exp_match[1], ',', '.')::numeric AS exp_num,
    CASE
      WHEN p.subtype = 'float' THEN COALESCE(NULLIF(p.task_payload->>'epsilon', '')::numeric, 0.01::numeric)
      ELSE 0::numeric
    END AS eps_val
  FROM parsed p
  WHERE p.ans_match IS NOT NULL
    AND p.exp_match IS NOT NULL
    AND BTRIM(COALESCE(p.ans_match[2], '')) <> ''
),
matched AS (
  SELECT
    t.*,
    CASE
      WHEN t.subtype = 'float' THEN ABS(t.got_num - t.exp_num) <= t.eps_val
      ELSE t.got_num = t.exp_num
    END AS is_match
  FROM target t
)
SELECT
  COUNT(*) FILTER (WHERE is_match) AS matched_rows,
  COUNT(DISTINCT attempt_id) FILTER (WHERE is_match) AS affected_attempts
FROM matched;
SQL
