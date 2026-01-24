#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="/opt/ni_site/monitor_logs"
mkdir -p "$OUT_DIR"
TS="$(date +%F_%H-%M-%S)"
OUT="$OUT_DIR/metrics_${TS}.log"

INTERVAL=3
DURATION=60
ITER=$((DURATION / INTERVAL))

log() { echo "$@" >> "$OUT"; }

log "Logging to $OUT"
log "Start: $(date)"
log "Interval: ${INTERVAL}s, Duration: ${DURATION}s, Iterations: ${ITER}"

for i in $(seq 1 "$ITER"); do
  log "---- $(date '+%F %T') ----"

  log "[uptime]"
  uptime >> "$OUT"

  log "[free -m]"
  free -m >> "$OUT"

  if command -v vmstat >/dev/null 2>&1; then
    log "[vmstat 1 2]"
    vmstat 1 2 | tail -n 1 >> "$OUT"
  fi

  if command -v mpstat >/dev/null 2>&1; then
    log "[mpstat -P ALL 1 1]"
    mpstat -P ALL 1 1 >> "$OUT"
  fi

  if command -v iostat >/dev/null 2>&1; then
    log "[iostat -xz 1 1]"
    iostat -xz 1 1 >> "$OUT"
  fi

  if command -v ss >/dev/null 2>&1; then
    log "[ss -s]"
    ss -s >> "$OUT"
    log "[ss counts]"
    log "ESTABLISHED: $(ss -tan state established | tail -n +2 | wc -l | tr -d ' ')"
    log "TIME-WAIT: $(ss -tan state time-wait | tail -n +2 | wc -l | tr -d ' ')"
  fi

  log "[df -h]"
  df -h >> "$OUT"

  log "[docker stats --no-stream]"
  docker stats --no-stream >> "$OUT"

  if [ -f /var/log/nginx/access.log ]; then
    log "[nginx last 50]"
    tail -n 50 /var/log/nginx/access.log >> "$OUT"
    log "[nginx rt/urt avg last 200]"
    tail -n 200 /var/log/nginx/access.log | \
      awk -F'rt=| urt=' 'NF>=3 {rt=$2; split($3,a," "); urt=a[1];
        if(rt!="" && rt!="-"){sum+=rt; n++}
        if(urt!="" && urt!="-"){sumu+=urt; nu++}
      } END {
        printf "rt_avg=%.4f urt_avg=%.4f (samples rt=%d urt=%d)\n",
        (n?sum/n:0),(nu?sumu/nu:0),n,nu
      }' >> "$OUT"
  fi

  log "[postgres activity]"
  docker compose exec -T db psql -U postgres -d ni_site -c "\
select count(*) as total,\
       count(*) filter (where state='active') as active,\
       count(*) filter (where wait_event_type is not null) as waiting\
from pg_stat_activity;\
select state, count(*) from pg_stat_activity group by state;\
select wait_event_type, wait_event, count(*)\
from pg_stat_activity\
where wait_event_type is not null\
group by 1,2 order by count(*) desc limit 5;\
select pid, now()-query_start as age, wait_event_type, wait_event, left(query,120) as query\
from pg_stat_activity\
where state='active'\
order by age desc limit 5;\
select blks_read, blks_hit, xact_commit, xact_rollback, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted\
from pg_stat_database where datname='ni_site';\
" >> "$OUT" 2>&1 || true

  if docker compose exec -T db psql -U postgres -d ni_site -Atc "select 1 from pg_extension where extname='pg_stat_statements'" 2>/dev/null | grep -q 1; then
    log "[pg_stat_statements top]"
    docker compose exec -T db psql -U postgres -d ni_site -c "\
select calls, mean_exec_time, rows, left(query,120)\
from pg_stat_statements\
order by mean_exec_time desc limit 5;\
" >> "$OUT" 2>&1 || true
  fi

  log "[redis info]"
  docker compose exec -T redis redis-cli info stats >> "$OUT" 2>&1 || true
  docker compose exec -T redis redis-cli info clients >> "$OUT" 2>&1 || true
  docker compose exec -T redis redis-cli info memory >> "$OUT" 2>&1 || true

  sleep "$INTERVAL"
done

log "End: $(date)"
