#!/usr/bin/env bash
set -euo pipefail

# Import final round results into attempts table so they appear in user cabinets.
# Reads two CSV files from repo root:
#   - math_final_attempts.csv  -> olympiad_id 52
#   - inf_final_attempts.csv   -> olympiad_id 53
#
# Supports:
#   DRY_RUN=1            validate and print summary without writing
#   PUBLISH_RESULTS=0    do not flip olympiads.results_released to true
#
# Usage:
#   DRY_RUN=1 ./import_final_round_attempts.sh
#   ./import_final_round_attempts.sh

MATH_CSV="${MATH_CSV:-./math_final_attempts.csv}"
INF_CSV="${INF_CSV:-./inf_final_attempts.csv}"
DRY_RUN="${DRY_RUN:-0}"
PUBLISH_RESULTS="${PUBLISH_RESULTS:-1}"
RUN_TS="$(date +%F_%H-%M-%S)"

if [[ ! -f "${MATH_CSV}" ]]; then
  echo "Math CSV not found: ${MATH_CSV}" >&2
  exit 1
fi

if [[ ! -f "${INF_CSV}" ]]; then
  echo "Informatics CSV not found: ${INF_CSV}" >&2
  exit 1
fi

TMP_MATH="/tmp/final_math_${RUN_TS}_$$.csv"
TMP_INF="/tmp/final_inf_${RUN_TS}_$$.csv"

cleanup() {
  docker compose exec -T db sh -lc "rm -f '${TMP_MATH}' '${TMP_INF}'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Copy CSV files into db container..."
docker compose cp "${MATH_CSV}" "db:${TMP_MATH}" >/dev/null
docker compose cp "${INF_CSV}" "db:${TMP_INF}" >/dev/null

MODE_LABEL="apply"
if [[ "${DRY_RUN}" == "1" ]]; then
  MODE_LABEL="dry-run"
fi

echo "Mode: ${MODE_LABEL}"
echo "Math CSV: ${MATH_CSV}"
echo "Inf CSV: ${INF_CSV}"
echo "Publish results_released for olympiads 52/53: ${PUBLISH_RESULTS}"

docker compose exec -T db psql -U postgres -d ni_site \
  -v ON_ERROR_STOP=1 \
  -v dry_run="${DRY_RUN}" \
  -v publish_results="${PUBLISH_RESULTS}" <<SQL
\pset pager off

BEGIN;

CREATE TEMP TABLE tmp_final_attempts_raw (
  source_file text NOT NULL DEFAULT '',
  id text,
  user_id text,
  olympiad_id text,
  olympiad_title text,
  user_full_name text,
  gender text,
  class_grade text,
  city text,
  school text,
  started_at text,
  completed_at text,
  duration_sec text,
  score_total text,
  score_max text,
  percent text
);

\copy tmp_final_attempts_raw (id, user_id, olympiad_id, olympiad_title, user_full_name, gender, class_grade, city, school, started_at, completed_at, duration_sec, score_total, score_max, percent) FROM '${TMP_MATH}' WITH (FORMAT csv, HEADER true, DELIMITER ';')
UPDATE tmp_final_attempts_raw SET source_file = 'math_final_attempts.csv' WHERE source_file = '';

\copy tmp_final_attempts_raw (id, user_id, olympiad_id, olympiad_title, user_full_name, gender, class_grade, city, school, started_at, completed_at, duration_sec, score_total, score_max, percent) FROM '${TMP_INF}' WITH (FORMAT csv, HEADER true, DELIMITER ';')
UPDATE tmp_final_attempts_raw SET source_file = 'inf_final_attempts.csv' WHERE source_file = '';

DELETE FROM tmp_final_attempts_raw
WHERE COALESCE(BTRIM(id), '') = ''
  AND COALESCE(BTRIM(user_id), '') = ''
  AND COALESCE(BTRIM(olympiad_id), '') = ''
  AND COALESCE(BTRIM(olympiad_title), '') = ''
  AND COALESCE(BTRIM(user_full_name), '') = ''
  AND COALESCE(BTRIM(gender), '') = ''
  AND COALESCE(BTRIM(class_grade), '') = ''
  AND COALESCE(BTRIM(city), '') = ''
  AND COALESCE(BTRIM(school), '') = ''
  AND COALESCE(BTRIM(started_at), '') = ''
  AND COALESCE(BTRIM(completed_at), '') = ''
  AND COALESCE(BTRIM(duration_sec), '') = ''
  AND COALESCE(BTRIM(score_total), '') = ''
  AND COALESCE(BTRIM(score_max), '') = ''
  AND COALESCE(BTRIM(percent), '') = '';

DO \$do\$
DECLARE
  v_duplicate_attempt_ids integer;
  v_duplicate_user_olympiads integer;
  v_invalid_olympiads integer;
  v_missing_users integer;
  v_missing_olympiads integer;
  v_existing_attempts integer;
BEGIN
  SELECT COUNT(*)
  INTO v_duplicate_attempt_ids
  FROM (
    SELECT BTRIM(id) AS id_value
    FROM tmp_final_attempts_raw
    GROUP BY BTRIM(id)
    HAVING COUNT(*) > 1
  ) t;

  IF v_duplicate_attempt_ids > 0 THEN
    RAISE EXCEPTION 'Import aborted: duplicate attempt ids in CSV set (% duplicates)', v_duplicate_attempt_ids;
  END IF;

  SELECT COUNT(*)
  INTO v_duplicate_user_olympiads
  FROM (
    SELECT BTRIM(user_id) AS user_id_value, BTRIM(olympiad_id) AS olympiad_id_value
    FROM tmp_final_attempts_raw
    GROUP BY BTRIM(user_id), BTRIM(olympiad_id)
    HAVING COUNT(*) > 1
  ) t;

  IF v_duplicate_user_olympiads > 0 THEN
    RAISE EXCEPTION 'Import aborted: duplicate (user_id, olympiad_id) rows in CSV set (% duplicates)', v_duplicate_user_olympiads;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_olympiads
  FROM tmp_final_attempts_raw
  WHERE BTRIM(olympiad_id) NOT IN ('52', '53');

  IF v_invalid_olympiads > 0 THEN
    RAISE EXCEPTION 'Import aborted: found rows with olympiad_id outside (52,53): %', v_invalid_olympiads;
  END IF;

  CREATE TEMP TABLE tmp_final_attempts_norm AS
  SELECT
    source_file,
    BTRIM(id)::integer AS id,
    BTRIM(user_id)::integer AS user_id,
    BTRIM(olympiad_id)::integer AS olympiad_id,
    NULLIF(BTRIM(olympiad_title), '') AS olympiad_title,
    NULLIF(BTRIM(user_full_name), '') AS user_full_name,
    NULLIF(BTRIM(gender), '') AS gender,
    NULLIF(BTRIM(class_grade), '')::integer AS class_grade,
    NULLIF(BTRIM(city), '') AS city,
    NULLIF(BTRIM(school), '') AS school,
    BTRIM(started_at)::timestamptz AS started_at,
    BTRIM(completed_at)::timestamptz AS completed_at,
    CASE
      WHEN BTRIM(duration_sec)::integer <= 600 THEN BTRIM(duration_sec)::integer * 60
      ELSE BTRIM(duration_sec)::integer
    END AS duration_sec,
    BTRIM(score_total)::integer AS score_total,
    BTRIM(score_max)::integer AS score_max,
    BTRIM(percent)::integer AS percent
  FROM tmp_final_attempts_raw;

  SELECT COUNT(*)
  INTO v_missing_users
  FROM tmp_final_attempts_norm n
  LEFT JOIN users u ON u.id = n.user_id
  WHERE u.id IS NULL;

  IF v_missing_users > 0 THEN
    RAISE EXCEPTION 'Import aborted: % rows reference missing users', v_missing_users;
  END IF;

  SELECT COUNT(*)
  INTO v_missing_olympiads
  FROM tmp_final_attempts_norm n
  LEFT JOIN olympiads o ON o.id = n.olympiad_id
  WHERE o.id IS NULL;

  IF v_missing_olympiads > 0 THEN
    RAISE EXCEPTION 'Import aborted: % rows reference missing olympiads', v_missing_olympiads;
  END IF;

  SELECT COUNT(*)
  INTO v_existing_attempts
  FROM attempts a
  JOIN (
    SELECT DISTINCT olympiad_id, user_id
    FROM tmp_final_attempts_norm
  ) n
    ON n.olympiad_id = a.olympiad_id
   AND n.user_id = a.user_id;

  IF v_existing_attempts > 0 THEN
    RAISE EXCEPTION 'Import aborted: existing attempts already found for these (user_id, olympiad_id) pairs: %', v_existing_attempts;
  END IF;
END
\$do\$;

SELECT
  COUNT(*) AS rows_in_import,
  COUNT(*) FILTER (WHERE olympiad_id = 52) AS math_rows,
  COUNT(*) FILTER (WHERE olympiad_id = 53) AS inf_rows,
  MIN(id) AS min_attempt_id,
  MAX(id) AS max_attempt_id,
  MIN(started_at) AS first_started_at,
  MAX(completed_at) AS last_completed_at,
  SUM(score_total) AS total_score_total,
  SUM(score_max) AS total_score_max
FROM tmp_final_attempts_norm;

SELECT
  olympiad_id,
  COUNT(*) AS attempts_count,
  MIN(id) AS min_attempt_id,
  MAX(id) AS max_attempt_id,
  ROUND(AVG(score_total)::numeric, 2) AS avg_score_total,
  ROUND(AVG(score_max)::numeric, 2) AS avg_score_max,
  ROUND(AVG(percent)::numeric, 2) AS avg_percent
FROM tmp_final_attempts_norm
GROUP BY olympiad_id
ORDER BY olympiad_id;

DO \$do\$
DECLARE
  v_dry_run boolean := ${DRY_RUN} = 1;
  v_publish_results boolean := ${PUBLISH_RESULTS} = 1;
  v_inserted integer;
BEGIN
  IF v_dry_run THEN
    RAISE NOTICE 'Dry-run mode: no data was written.';
    RETURN;
  END IF;

  INSERT INTO attempts (
    id,
    olympiad_id,
    user_id,
    started_at,
    deadline_at,
    duration_sec,
    status,
    score_total,
    score_max,
    passed,
    graded_at
  )
  SELECT
    n.id,
    n.olympiad_id,
    n.user_id,
    n.started_at,
    n.completed_at,
    n.duration_sec,
    'submitted'::attemptstatus,
    n.score_total,
    n.score_max,
    CASE
      WHEN n.score_max <= 0 THEN FALSE
      ELSE n.score_total >= CEIL(n.score_max * o.pass_percent / 100.0)
    END,
    n.completed_at
  FROM tmp_final_attempts_norm n
  JOIN olympiads o ON o.id = n.olympiad_id
  ORDER BY n.id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Inserted attempts: %', v_inserted;

  PERFORM setval(
    pg_get_serial_sequence('attempts', 'id'),
    (SELECT COALESCE(MAX(id), 1) FROM attempts),
    true
  );

  IF v_publish_results THEN
    UPDATE olympiads
    SET results_released = TRUE
    WHERE id IN (52, 53);

    RAISE NOTICE 'Olympiads 52 and 53 marked as results_released=true';
  END IF;
END
\$do\$;

SELECT
  id,
  results_released,
  pass_percent
FROM olympiads
WHERE id IN (52, 53)
ORDER BY id;

\if :dry_run
ROLLBACK;
\else
COMMIT;
\endif
SQL

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "Dry-run completed."
else
  echo "Import completed."
fi
