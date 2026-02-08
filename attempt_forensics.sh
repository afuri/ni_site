#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./attempt_forensics.sh <user_id> [attempt_id]

Arguments:
  user_id     Required numeric user id.
  attempt_id  Optional numeric attempt id to narrow the report.

Connection:
  Uses Docker Compose DB container only (same style as regrade_task49.sh).
  Defaults:
    DB_SERVICE=db
    PGUSER=postgres
    PGDATABASE=ni_site

Examples:
  ./attempt_forensics.sh 123
  ./attempt_forensics.sh 123 456
  DB_SERVICE=db PGUSER=postgres PGDATABASE=ni_site ./attempt_forensics.sh 123
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

USER_ID="$1"
ATTEMPT_ID="${2:-}"

if ! [[ "${USER_ID}" =~ ^[0-9]+$ ]]; then
  echo "Error: user_id must be numeric." >&2
  exit 1
fi

if [[ -n "${ATTEMPT_ID}" ]] && ! [[ "${ATTEMPT_ID}" =~ ^[0-9]+$ ]]; then
  echo "Error: attempt_id must be numeric." >&2
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
  echo "Set DB_SERVICE if your DB service has another name." >&2
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

ATTEMPT_COND=""
if [[ -n "${ATTEMPT_ID}" ]]; then
  ATTEMPT_COND="AND a.id = ${ATTEMPT_ID}"
fi

echo "Attempt forensic report"
echo "generated_at_utc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "mode: docker_compose_exec"
echo "db_service: ${DB_SERVICE}"
echo "db_user: ${PGUSER}"
echo "db_name: ${PGDATABASE}"
echo "user_id: ${USER_ID}"
if [[ -n "${ATTEMPT_ID}" ]]; then
  echo "attempt_id_filter: ${ATTEMPT_ID}"
fi

run_section "Section 1: User Profile And Attempt Counters" <<SQL
SELECT
  u.id,
  u.login,
  u.email,
  u.role,
  u.class_grade,
  u.is_email_verified,
  u.created_at,
  COUNT(a.id) AS attempts_total,
  COUNT(*) FILTER (WHERE a.status = 'active') AS attempts_active,
  COUNT(*) FILTER (WHERE a.status = 'submitted') AS attempts_submitted,
  COUNT(*) FILTER (WHERE a.status = 'expired') AS attempts_expired
FROM users u
LEFT JOIN attempts a ON a.user_id = u.id
WHERE u.id = ${USER_ID}
GROUP BY u.id, u.login, u.email, u.role, u.class_grade, u.is_email_verified, u.created_at;
SQL

run_section "Section 2: Olympiad Assignments And Pool State" <<SQL
SELECT
  oa.created_at AS assigned_at,
  oa.pool_id,
  p.subject,
  p.grade_group,
  p.is_active AS pool_is_active,
  oa.olympiad_id,
  o.title AS olympiad_title,
  o.is_published,
  o.duration_sec AS olympiad_duration_sec,
  o.available_from,
  o.available_to,
  o.updated_at AS olympiad_updated_at
FROM olympiad_assignments oa
JOIN olympiad_pools p ON p.id = oa.pool_id
JOIN olympiads o ON o.id = oa.olympiad_id
WHERE oa.user_id = ${USER_ID}
ORDER BY oa.created_at DESC;
SQL

run_section "Section 3: Attempts Detailed Snapshot" <<SQL
SELECT
  a.id AS attempt_id,
  a.olympiad_id,
  o.title AS olympiad_title,
  a.status,
  a.started_at,
  a.deadline_at,
  a.duration_sec AS attempt_duration_sec,
  o.duration_sec AS olympiad_duration_sec,
  ROUND(EXTRACT(EPOCH FROM (a.deadline_at - a.started_at))::numeric, 3) AS actual_window_sec,
  ROUND((EXTRACT(EPOCH FROM (a.deadline_at - a.started_at)) - a.duration_sec)::numeric, 3) AS window_minus_attempt_duration_sec,
  (a.deadline_at <= a.started_at) AS deadline_not_after_start,
  ROUND(EXTRACT(EPOCH FROM (o.available_to - a.started_at))::numeric, 3) AS sec_until_olympiad_available_to_from_start,
  a.score_total,
  a.score_max,
  a.passed,
  a.graded_at,
  COALESCE(ans.answers_cnt, 0) AS answers_cnt,
  ans.first_answer_at,
  ans.last_answer_at,
  COALESCE(gr.grades_cnt, 0) AS grades_cnt,
  gr.first_grade_at,
  gr.last_grade_at
FROM attempts a
JOIN olympiads o ON o.id = a.olympiad_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS answers_cnt,
    MIN(updated_at) AS first_answer_at,
    MAX(updated_at) AS last_answer_at
  FROM attempt_answers aa
  WHERE aa.attempt_id = a.id
) ans ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS grades_cnt,
    MIN(graded_at) AS first_grade_at,
    MAX(graded_at) AS last_grade_at
  FROM attempt_task_grades ag
  WHERE ag.attempt_id = a.id
) gr ON TRUE
WHERE a.user_id = ${USER_ID}
  ${ATTEMPT_COND}
ORDER BY a.started_at DESC, a.id DESC;
SQL

run_section "Section 4: Attempt Task Counts (Empty Olympiad Check)" <<SQL
SELECT
  a.id AS attempt_id,
  a.olympiad_id,
  COUNT(ot.task_id) AS olympiad_tasks_cnt
FROM attempts a
LEFT JOIN olympiad_tasks ot ON ot.olympiad_id = a.olympiad_id
WHERE a.user_id = ${USER_ID}
  ${ATTEMPT_COND}
GROUP BY a.id, a.olympiad_id
ORDER BY a.id DESC;
SQL

run_section "Section 5: Per-Attempt Audit Signals" <<SQL
WITH attempts_scope AS (
  SELECT a.*
  FROM attempts a
  WHERE a.user_id = ${USER_ID}
    ${ATTEMPT_COND}
)
SELECT
  a.id AS attempt_id,
  a.status,
  a.started_at,
  a.deadline_at,
  MIN(al.created_at) FILTER (
    WHERE al.path = '/api/v1/attempts/' || a.id
      AND al.method = 'GET'
      AND al.status_code BETWEEN 200 AND 299
  ) AS first_get_attempt_at,
  ROUND(
    EXTRACT(EPOCH FROM (
      MIN(al.created_at) FILTER (
        WHERE al.path = '/api/v1/attempts/' || a.id
          AND al.method = 'GET'
          AND al.status_code BETWEEN 200 AND 299
      ) - a.started_at
    ))::numeric,
    3
  ) AS sec_to_first_get_attempt,
  MIN(al.created_at) FILTER (
    WHERE al.path = '/api/v1/attempts/' || a.id || '/submit'
      AND al.method = 'POST'
      AND al.status_code BETWEEN 200 AND 299
  ) AS first_submit_at,
  ROUND(
    EXTRACT(EPOCH FROM (
      MIN(al.created_at) FILTER (
        WHERE al.path = '/api/v1/attempts/' || a.id || '/submit'
          AND al.method = 'POST'
          AND al.status_code BETWEEN 200 AND 299
      ) - a.started_at
    ))::numeric,
    3
  ) AS sec_to_first_submit,
  CASE
    WHEN MIN(al.created_at) FILTER (
      WHERE al.path = '/api/v1/attempts/' || a.id || '/submit'
        AND al.method = 'POST'
        AND al.status_code BETWEEN 200 AND 299
    ) IS NOT NULL
      AND EXTRACT(EPOCH FROM (
        MIN(al.created_at) FILTER (
          WHERE al.path = '/api/v1/attempts/' || a.id || '/submit'
            AND al.method = 'POST'
            AND al.status_code BETWEEN 200 AND 299
        ) - a.started_at
      )) <= 5
      THEN 'very_fast_submit'
    WHEN a.status = 'expired'
      AND MIN(al.created_at) FILTER (
        WHERE al.path = '/api/v1/attempts/' || a.id || '/submit'
          AND al.method = 'POST'
          AND al.status_code BETWEEN 200 AND 299
      ) IS NULL
      THEN 'expired_without_submit_call'
    WHEN a.status <> 'active'
      AND EXTRACT(EPOCH FROM (a.deadline_at - a.started_at)) <= 5
      THEN 'very_short_deadline_window'
    ELSE 'inspect_raw_timeline'
  END AS signal
FROM attempts_scope a
LEFT JOIN audit_logs al
  ON al.user_id = ${USER_ID}
  AND al.path IN (
    '/api/v1/attempts/' || a.id,
    '/api/v1/attempts/' || a.id || '/submit'
  )
GROUP BY a.id, a.status, a.started_at, a.deadline_at
ORDER BY a.started_at DESC, a.id DESC;
SQL

run_section "Section 6: Raw Attempt API Audit (Last 400 Rows)" <<SQL
SELECT
  al.created_at,
  al.method,
  al.path,
  al.status_code,
  al.request_id,
  al.ip,
  al.user_agent
FROM audit_logs al
WHERE al.user_id = ${USER_ID}
  AND al.path LIKE '/api/v1/attempts%'
ORDER BY al.created_at DESC, al.id DESC
LIMIT 400;
SQL

run_section "Section 7: Timeline Around Latest Attempt (User + Admin Expire)" <<SQL
WITH last_attempt AS (
  SELECT a.started_at, a.deadline_at
  FROM attempts a
  WHERE a.user_id = ${USER_ID}
    ${ATTEMPT_COND}
  ORDER BY a.started_at DESC, a.id DESC
  LIMIT 1
),
bounds AS (
  SELECT
    COALESCE((SELECT started_at - INTERVAL '10 minutes' FROM last_attempt), now() - INTERVAL '24 hours') AS from_ts,
    COALESCE((SELECT deadline_at + INTERVAL '30 minutes' FROM last_attempt), now()) AS to_ts
)
SELECT
  al.created_at,
  al.user_id,
  al.method,
  al.path,
  al.status_code,
  al.request_id
FROM audit_logs al, bounds b
WHERE al.created_at BETWEEN b.from_ts AND b.to_ts
  AND (
    (al.user_id = ${USER_ID} AND al.path LIKE '/api/v1/attempts%')
    OR al.path = '/api/v1/admin/stats/attempts/expire'
  )
ORDER BY al.created_at ASC, al.id ASC;
SQL

run_section "Section 8: Admin Expire Calls Correlated To User Attempts" <<SQL
WITH attempts_scope AS (
  SELECT a.id, a.status, a.started_at, a.deadline_at
  FROM attempts a
  WHERE a.user_id = ${USER_ID}
    ${ATTEMPT_COND}
)
SELECT
  ae.created_at AS admin_expire_at,
  ae.user_id AS admin_actor_user_id,
  ae.status_code AS admin_expire_status_code,
  a.id AS attempt_id,
  a.status AS attempt_status_now,
  a.started_at,
  a.deadline_at,
  ROUND(EXTRACT(EPOCH FROM (ae.created_at - a.started_at))::numeric, 3) AS sec_from_start,
  ROUND(EXTRACT(EPOCH FROM (ae.created_at - a.deadline_at))::numeric, 3) AS sec_from_deadline
FROM audit_logs ae
JOIN attempts_scope a
  ON ae.created_at BETWEEN a.started_at - INTERVAL '10 minutes' AND a.deadline_at + INTERVAL '10 minutes'
WHERE ae.path = '/api/v1/admin/stats/attempts/expire'
ORDER BY ae.created_at DESC, a.id DESC;
SQL

run_section "Section 9: Latest Attempt Quick Diagnosis" <<SQL
WITH latest AS (
  SELECT
    a.id,
    a.status,
    a.started_at,
    a.deadline_at,
    a.duration_sec
  FROM attempts a
  WHERE a.user_id = ${USER_ID}
    ${ATTEMPT_COND}
  ORDER BY a.started_at DESC, a.id DESC
  LIMIT 1
),
metrics AS (
  SELECT
    l.*,
    (SELECT COUNT(*) FROM attempt_answers aa WHERE aa.attempt_id = l.id) AS answers_cnt,
    (SELECT COUNT(*) FROM attempt_task_grades ag WHERE ag.attempt_id = l.id) AS grades_cnt,
    (
      SELECT MIN(al.created_at)
      FROM audit_logs al
      WHERE al.user_id = ${USER_ID}
        AND al.path = '/api/v1/attempts/' || l.id
        AND al.method = 'GET'
        AND al.status_code BETWEEN 200 AND 299
    ) AS first_get_attempt_at,
    (
      SELECT MIN(al.created_at)
      FROM audit_logs al
      WHERE al.user_id = ${USER_ID}
        AND al.path = '/api/v1/attempts/' || l.id || '/submit'
        AND al.method = 'POST'
        AND al.status_code BETWEEN 200 AND 299
    ) AS first_submit_at
  FROM latest l
)
SELECT
  id AS attempt_id,
  status,
  started_at,
  deadline_at,
  duration_sec AS attempt_duration_sec,
  ROUND(EXTRACT(EPOCH FROM (deadline_at - started_at))::numeric, 3) AS actual_window_sec,
  answers_cnt,
  grades_cnt,
  first_get_attempt_at,
  first_submit_at,
  ROUND(EXTRACT(EPOCH FROM (first_get_attempt_at - started_at))::numeric, 3) AS sec_to_first_get,
  ROUND(EXTRACT(EPOCH FROM (first_submit_at - started_at))::numeric, 3) AS sec_to_first_submit,
  CASE
    WHEN first_submit_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (first_submit_at - started_at)) <= 5
      THEN 'likely_auto_or_instant_submit'
    WHEN status = 'expired' AND first_submit_at IS NULL AND answers_cnt = 0
      THEN 'likely_deadline_or_old_attempt_reopen'
    WHEN EXTRACT(EPOCH FROM (deadline_at - started_at)) <= 5
      THEN 'likely_bad_duration_or_bad_deadline'
    WHEN status <> 'active' AND first_get_attempt_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (first_get_attempt_at - started_at)) > 3600
      THEN 'likely_old_attempt_opened_again'
    ELSE 'needs_manual_timeline_review'
  END AS likely_cause
FROM metrics;
SQL

echo
echo "Done."
