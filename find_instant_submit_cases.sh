#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./find_instant_submit_cases.sh [lookback_days] [submit_threshold_sec] [limit]

Arguments:
  lookback_days         Optional, default 14
  submit_threshold_sec  Optional, default 5
  limit                 Optional, default 500

Environment:
  DB_SERVICE   Docker Compose service name for PostgreSQL (default: db)
  PGUSER       Postgres user (default: POSTGRES_USER or postgres)
  PGDATABASE   Postgres database (default: POSTGRES_DB or ni_site)

Examples:
  ./find_instant_submit_cases.sh
  ./find_instant_submit_cases.sh 30 3 1000
  DB_SERVICE=db ./find_instant_submit_cases.sh 14 5 500
USAGE
}

LOOKBACK_DAYS="${1:-14}"
SUBMIT_THRESHOLD_SEC="${2:-5}"
LIMIT_ROWS="${3:-500}"

if [[ "${LOOKBACK_DAYS}" == "-h" || "${LOOKBACK_DAYS}" == "--help" ]]; then
  usage
  exit 0
fi

if ! [[ "${LOOKBACK_DAYS}" =~ ^[0-9]+$ ]]; then
  echo "Error: lookback_days must be a non-negative integer." >&2
  exit 1
fi

if ! [[ "${SUBMIT_THRESHOLD_SEC}" =~ ^[0-9]+$ ]]; then
  echo "Error: submit_threshold_sec must be a non-negative integer." >&2
  exit 1
fi

if ! [[ "${LIMIT_ROWS}" =~ ^[0-9]+$ ]]; then
  echo "Error: limit must be a non-negative integer." >&2
  exit 1
fi

DB_SERVICE="${DB_SERVICE:-db}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-ni_site}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker compose ps "${DB_SERVICE}" >/dev/null 2>&1; then
  echo "Error: docker compose service '${DB_SERVICE}' is unavailable." >&2
  exit 1
fi

run_psql() {
  docker compose exec -T "${DB_SERVICE}" psql \
    -U "${PGUSER}" \
    -d "${PGDATABASE}" \
    -X \
    -v ON_ERROR_STOP=1 \
    -P pager=off \
    -P null='NULL'
}

run_section() {
  local title="$1"
  echo
  echo "================================================================================"
  echo "${title}"
  echo "================================================================================"
  run_psql
}

echo "Instant submit detector"
echo "generated_at_utc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "db_service: ${DB_SERVICE}"
echo "db_user: ${PGUSER}"
echo "db_name: ${PGDATABASE}"
echo "lookback_days: ${LOOKBACK_DAYS}"
echo "submit_threshold_sec: ${SUBMIT_THRESHOLD_SEC}"
echo "limit: ${LIMIT_ROWS}"

run_section "Section 1: Global Summary" <<SQL
WITH scope AS (
  SELECT
    a.id AS attempt_id,
    a.user_id,
    a.status,
    a.started_at
  FROM attempts a
  WHERE a.started_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
),
answers AS (
  SELECT
    aa.attempt_id,
    COUNT(*) AS answers_cnt
  FROM attempt_answers aa
  GROUP BY aa.attempt_id
),
audit AS (
  SELECT
    al.user_id,
    al.method,
    al.path,
    al.status_code,
    al.created_at
  FROM audit_logs al
  WHERE al.created_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
    AND al.path LIKE '/api/v1/attempts/%'
),
first_submit AS (
  SELECT
    s.attempt_id,
    MIN(al.created_at) AS first_submit_at
  FROM scope s
  LEFT JOIN audit al
    ON al.user_id = s.user_id
   AND al.method = 'POST'
   AND al.status_code BETWEEN 200 AND 299
   AND al.path = '/api/v1/attempts/' || s.attempt_id || '/submit'
  GROUP BY s.attempt_id
),
suspicious AS (
  SELECT
    s.attempt_id,
    s.user_id,
    s.status,
    s.started_at,
    fs.first_submit_at,
    COALESCE(a.answers_cnt, 0) AS answers_cnt,
    EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) AS sec_to_submit
  FROM scope s
  LEFT JOIN first_submit fs ON fs.attempt_id = s.attempt_id
  LEFT JOIN answers a ON a.attempt_id = s.attempt_id
  WHERE fs.first_submit_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) >= 0
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) <= ${SUBMIT_THRESHOLD_SEC}
    AND COALESCE(a.answers_cnt, 0) = 0
)
SELECT
  COUNT(*) AS suspicious_attempts,
  COUNT(DISTINCT user_id) AS affected_users,
  MIN(first_submit_at) AS first_detected_at,
  MAX(first_submit_at) AS last_detected_at
FROM suspicious;
SQL

run_section "Section 2: Summary By Day (UTC)" <<SQL
WITH scope AS (
  SELECT
    a.id AS attempt_id,
    a.user_id,
    a.started_at
  FROM attempts a
  WHERE a.started_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
),
answers AS (
  SELECT
    aa.attempt_id,
    COUNT(*) AS answers_cnt
  FROM attempt_answers aa
  GROUP BY aa.attempt_id
),
audit AS (
  SELECT
    al.user_id,
    al.method,
    al.path,
    al.status_code,
    al.created_at
  FROM audit_logs al
  WHERE al.created_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
    AND al.path LIKE '/api/v1/attempts/%'
),
first_submit AS (
  SELECT
    s.attempt_id,
    MIN(al.created_at) AS first_submit_at
  FROM scope s
  LEFT JOIN audit al
    ON al.user_id = s.user_id
   AND al.method = 'POST'
   AND al.status_code BETWEEN 200 AND 299
   AND al.path = '/api/v1/attempts/' || s.attempt_id || '/submit'
  GROUP BY s.attempt_id
),
suspicious AS (
  SELECT
    s.attempt_id,
    s.user_id,
    fs.first_submit_at,
    COALESCE(a.answers_cnt, 0) AS answers_cnt,
    EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) AS sec_to_submit
  FROM scope s
  LEFT JOIN first_submit fs ON fs.attempt_id = s.attempt_id
  LEFT JOIN answers a ON a.attempt_id = s.attempt_id
  WHERE fs.first_submit_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) >= 0
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) <= ${SUBMIT_THRESHOLD_SEC}
    AND COALESCE(a.answers_cnt, 0) = 0
)
SELECT
  DATE_TRUNC('day', first_submit_at) AS day_utc,
  COUNT(*) AS suspicious_attempts,
  COUNT(DISTINCT user_id) AS affected_users
FROM suspicious
GROUP BY 1
ORDER BY 1 DESC;
SQL

run_section "Section 3: Top Affected Users" <<SQL
WITH scope AS (
  SELECT
    a.id AS attempt_id,
    a.user_id,
    a.started_at
  FROM attempts a
  WHERE a.started_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
),
answers AS (
  SELECT
    aa.attempt_id,
    COUNT(*) AS answers_cnt
  FROM attempt_answers aa
  GROUP BY aa.attempt_id
),
audit AS (
  SELECT
    al.user_id,
    al.method,
    al.path,
    al.status_code,
    al.created_at
  FROM audit_logs al
  WHERE al.created_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
    AND al.path LIKE '/api/v1/attempts/%'
),
first_submit AS (
  SELECT
    s.attempt_id,
    MIN(al.created_at) AS first_submit_at
  FROM scope s
  LEFT JOIN audit al
    ON al.user_id = s.user_id
   AND al.method = 'POST'
   AND al.status_code BETWEEN 200 AND 299
   AND al.path = '/api/v1/attempts/' || s.attempt_id || '/submit'
  GROUP BY s.attempt_id
),
suspicious AS (
  SELECT
    s.attempt_id,
    s.user_id,
    fs.first_submit_at
  FROM scope s
  LEFT JOIN first_submit fs ON fs.attempt_id = s.attempt_id
  LEFT JOIN answers a ON a.attempt_id = s.attempt_id
  WHERE fs.first_submit_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) >= 0
    AND EXTRACT(EPOCH FROM (fs.first_submit_at - s.started_at)) <= ${SUBMIT_THRESHOLD_SEC}
    AND COALESCE(a.answers_cnt, 0) = 0
)
SELECT
  s.user_id,
  u.login,
  u.email,
  COUNT(*) AS suspicious_attempts,
  MIN(s.first_submit_at) AS first_detected_at,
  MAX(s.first_submit_at) AS last_detected_at
FROM suspicious s
JOIN users u ON u.id = s.user_id
GROUP BY s.user_id, u.login, u.email
ORDER BY suspicious_attempts DESC, s.user_id ASC
LIMIT ${LIMIT_ROWS};
SQL

run_section "Section 4: Suspicious Attempts Details" <<SQL
WITH scope AS (
  SELECT
    a.id AS attempt_id,
    a.user_id,
    u.login,
    u.email,
    a.olympiad_id,
    o.title AS olympiad_title,
    a.status,
    a.started_at,
    a.deadline_at,
    a.duration_sec
  FROM attempts a
  JOIN users u ON u.id = a.user_id
  JOIN olympiads o ON o.id = a.olympiad_id
  WHERE a.started_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
),
answers AS (
  SELECT
    aa.attempt_id,
    COUNT(*) AS answers_cnt,
    MIN(aa.updated_at) AS first_answer_at
  FROM attempt_answers aa
  GROUP BY aa.attempt_id
),
grades AS (
  SELECT
    ag.attempt_id,
    COUNT(*) AS grades_cnt
  FROM attempt_task_grades ag
  GROUP BY ag.attempt_id
),
audit AS (
  SELECT
    al.user_id,
    al.method,
    al.path,
    al.status_code,
    al.created_at
  FROM audit_logs al
  WHERE al.created_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
    AND (
      al.path = '/api/v1/attempts/start'
      OR al.path LIKE '/api/v1/attempts/%'
    )
),
agg AS (
  SELECT
    s.attempt_id,
    MIN(a.created_at) FILTER (
      WHERE a.method = 'GET'
        AND a.status_code BETWEEN 200 AND 299
        AND a.path = '/api/v1/attempts/' || s.attempt_id
    ) AS first_get_at,
    MIN(a.created_at) FILTER (
      WHERE a.method = 'POST'
        AND a.status_code BETWEEN 200 AND 299
        AND a.path = '/api/v1/attempts/' || s.attempt_id || '/submit'
    ) AS first_submit_at,
    COUNT(*) FILTER (
      WHERE a.method = 'POST'
        AND a.status_code BETWEEN 200 AND 299
        AND a.path = '/api/v1/attempts/' || s.attempt_id || '/submit'
    ) AS submit_calls_cnt,
    COUNT(*) FILTER (
      WHERE a.method = 'POST'
        AND a.status_code BETWEEN 200 AND 299
        AND a.path = '/api/v1/attempts/start'
        AND a.created_at BETWEEN s.started_at - INTERVAL '10 seconds' AND s.started_at + INTERVAL '15 minutes'
    ) AS start_calls_nearby
  FROM scope s
  LEFT JOIN audit a ON a.user_id = s.user_id
  GROUP BY s.attempt_id
),
suspicious AS (
  SELECT
    s.attempt_id,
    s.user_id,
    s.login,
    s.email,
    s.olympiad_id,
    s.olympiad_title,
    s.status,
    s.started_at,
    s.deadline_at,
    s.duration_sec,
    COALESCE(ans.answers_cnt, 0) AS answers_cnt,
    ans.first_answer_at,
    COALESCE(gr.grades_cnt, 0) AS grades_cnt,
    ag.first_get_at,
    ag.first_submit_at,
    ROUND(EXTRACT(EPOCH FROM (ag.first_get_at - s.started_at))::numeric, 3) AS sec_to_get,
    ROUND(EXTRACT(EPOCH FROM (ag.first_submit_at - s.started_at))::numeric, 3) AS sec_to_submit,
    ag.submit_calls_cnt,
    ag.start_calls_nearby
  FROM scope s
  LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id
  LEFT JOIN grades gr ON gr.attempt_id = s.attempt_id
  LEFT JOIN agg ag ON ag.attempt_id = s.attempt_id
  WHERE ag.first_submit_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (ag.first_submit_at - s.started_at)) >= 0
    AND EXTRACT(EPOCH FROM (ag.first_submit_at - s.started_at)) <= ${SUBMIT_THRESHOLD_SEC}
    AND COALESCE(ans.answers_cnt, 0) = 0
)
SELECT
  attempt_id,
  user_id,
  login,
  email,
  olympiad_id,
  olympiad_title,
  status,
  started_at,
  deadline_at,
  duration_sec,
  first_get_at,
  first_submit_at,
  sec_to_get,
  sec_to_submit,
  answers_cnt,
  first_answer_at,
  grades_cnt,
  submit_calls_cnt,
  start_calls_nearby
FROM suspicious
ORDER BY first_submit_at DESC, attempt_id DESC
LIMIT ${LIMIT_ROWS};
SQL

echo
echo "Done."
