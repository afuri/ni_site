#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="/opt/ni_site/monitor_logs"
mkdir -p "$OUT_DIR"
TS="$(date +%F_%H-%M-%S)"
OUT="$OUT_DIR/metrics_${TS}.log"

INTERVAL="${INTERVAL:-5}"
DURATION="${DURATION:-660}"
ITER=$((DURATION / INTERVAL))

log() { echo "$@" >> "$OUT"; }

log "Logging to $OUT"
log "Start: $(date)"
log "Interval: ${INTERVAL}s, Duration: ${DURATION}s, Iterations: ${ITER}"
log "[sysctl tcp]"
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_fin_timeout net.ipv4.tcp_tw_reuse 2>/dev/null >> "$OUT" || true
log "[ulimit]"
ulimit -n >> "$OUT" 2>/dev/null || true

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
    log "SYN-RECV: $(ss -tan state syn-recv | tail -n +2 | wc -l | tr -d ' ')"
    log "[ss 443 states]"
    ss -tan 'sport = :443' | awk 'NR>1 {state[$1]++} END {for (s in state) printf "%s %d\n", s, state[s]}' >> "$OUT"
    log "[ss 80 states]"
    ss -tan 'sport = :80' | awk 'NR>1 {state[$1]++} END {for (s in state) printf "%s %d\n", s, state[s]}' >> "$OUT"
    log "[ss listen queues]"
    ss -ltnp | awk 'NR==1 || /:(80|443)\\b/' >> "$OUT"
  fi

  log "[df -h]"
  df -h >> "$OUT"

  log "[docker stats --no-stream]"
  docker stats --no-stream >> "$OUT"

  if [ -f /var/log/nginx/access.log ]; then
    log "[nginx last 50]"
    tail -n 50 /var/log/nginx/access.log >> "$OUT"
    log "[nginx rps last ${INTERVAL}s]"
    tail -n 5000 /var/log/nginx/access.log | \
      python3 - "$INTERVAL" >> "$OUT" 2>&1 <<'PY' || true
import sys, time, re, datetime
interval = int(sys.argv[1]) if len(sys.argv) > 1 else 5
now = time.time()
count = 0
rx = re.compile(r"\[(\d{2})/(\w{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]")
for line in sys.stdin:
    m = rx.search(line)
    if not m:
        continue
    day, mon, year, hh, mm, ss, tz = m.groups()
    try:
        dt = datetime.datetime.strptime(
            f"{day} {mon} {year} {hh}:{mm}:{ss} {tz}",
            "%d %b %Y %H:%M:%S %z",
        )
    except Exception:
        continue
    if dt.timestamp() >= now - interval:
        count += 1
rate = (count / interval) if interval > 0 else 0
print(f"rps_last_{interval}s={rate:.2f} (n={count})")
PY
    log "[nginx rt/urt avg last 200]"
    tail -n 200 /var/log/nginx/access.log | \
      awk -F'rt=| urt=' 'NF>=3 {rt=$2; split($3,a," "); urt=a[1];
        if(rt!="" && rt!="-"){sum+=rt; n++}
        if(urt!="" && urt!="-"){split(urt,b,","); sumu+=b[1]; nu++}
      } END {
        printf "rt_avg=%.4f urt_avg=%.4f (samples rt=%d urt=%d)\n",
        (n?sum/n:0),(nu?sumu/nu:0),n,nu
      }' >> "$OUT"
    log "[nginx rt p95 last 2000]"
    tail -n 2000 /var/log/nginx/access.log | \
      awk -F'rt=' 'NF>=2{split($2,a," "); if(a[1]!="-") print a[1]}' | \
      sort -n | \
      awk 'NR==1{min=$1} {vals[NR]=$1} END {if(NR==0){print "rt_p95=0"; exit} idx=int((NR*0.95)+0.5); if(idx<1) idx=1; if(idx>NR) idx=NR; printf "rt_p95=%.4f (n=%d min=%.4f max=%.4f)\n", vals[idx], NR, min, vals[NR] }' >> "$OUT"
    log "[nginx urt p95 last 2000]"
    tail -n 2000 /var/log/nginx/access.log | \
      awk -F'urt=' 'NF>=2{split($2,a," "); if(a[1]!="-"){split(a[1],b,","); print b[1]}}' | \
      sort -n | \
      awk 'NR==1{min=$1} {vals[NR]=$1} END {if(NR==0){print "urt_p95=0"; exit} idx=int((NR*0.95)+0.5); if(idx<1) idx=1; if(idx>NR) idx=NR; printf "urt_p95=%.4f (n=%d min=%.4f max=%.4f)\n", vals[idx], NR, min, vals[NR] }' >> "$OUT"
    log "[nginx status counts last 2000]"
    tail -n 2000 /var/log/nginx/access.log | \
      awk -F'"' '{status=$3; split(status,a," "); code=a[1]; if(code ~ /^[0-9]+$/){bucket=int(code/100) "xx"; c[bucket]++}} END {for (b in c) printf "%s %d\n", b, c[b]}' | \
      sort >> "$OUT"
    log "[nginx 5xx rate last 2000]"
    tail -n 2000 /var/log/nginx/access.log | \
      awk -F'"' '{status=$3; split(status,a," "); code=a[1]; if(code ~ /^[0-9]+$/){total++; if(code >= 500) err++}} END {printf "5xx_rate=%.4f (%d/%d)\n", (total?err/total:0), err, total}' >> "$OUT"
    log "[nginx top paths by bytes last 2000]"
    tail -n 2000 /var/log/nginx/access.log | \
      awk -F'"' '{req=$2; split(req,a," "); path=a[2]; status=$3; split(status,b," "); bytes=b[3]; if(bytes ~ /^[0-9]+$/ && path!=""){sum[path]+=bytes; cnt[path]++}} END {for(p in sum) printf "%s\t%s\t%d\n", p, sum[p], cnt[p]}' | \
      sort -k2,2nr | head -n 10 >> "$OUT"
  fi

  log "[postgres activity]"
  docker compose exec -T db psql -U postgres -d ni_site <<'SQL' >> "$OUT" 2>&1 || true
select count(*) as total,
       count(*) filter (where state = 'active') as active,
       count(*) filter (where wait_event_type is not null) as waiting
from pg_stat_activity;

select state, count(*) from pg_stat_activity group by state;

select wait_event_type, wait_event, count(*)
from pg_stat_activity
where wait_event_type is not null
group by 1,2 order by count(*) desc limit 5;

select count(*) as idle_in_transaction
from pg_stat_activity
where state = 'idle in transaction';

-- Кто держит idle in transaction (кратко):
select now() - xact_start as age,
       client_addr,
       application_name,
       state,
       left(query, 200) as query
from pg_stat_activity
where state = 'idle in transaction'
order by xact_start asc
limit 20;

-- Кто держит idle in transaction (подробно):
select pid,
       usename,
       client_addr,
       application_name,
       now() - xact_start as xact_age,
       now() - query_start as query_age,
       wait_event_type,
       wait_event,
       left(query, 200) as query
from pg_stat_activity
where state = 'idle in transaction'
order by xact_start asc
limit 30;

select application_name,
       count(*) as idle_in_txn
from pg_stat_activity
where state = 'idle in transaction'
group by application_name
order by idle_in_txn desc;

select client_addr,
       count(*) as idle_in_txn
from pg_stat_activity
where state = 'idle in transaction'
group by client_addr
order by idle_in_txn desc;

select pid,
       now() - query_start as age,
       wait_event_type,
       wait_event,
       left(query, 120) as query
from pg_stat_activity
where state = 'active'
order by age desc
limit 5;

select pid,
       now() - xact_start as xact_age,
       state,
       left(query, 120) as query
from pg_stat_activity
where xact_start is not null
order by xact_start asc
limit 5;

select datname,
       round(blks_hit * 100.0 / nullif(blks_hit + blks_read, 0), 2) as cache_hit_pct,
       blks_read, blks_hit, xact_commit, xact_rollback,
       tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted
from pg_stat_database
where datname = 'ni_site';

select checkpoints_timed, checkpoints_req, checkpoint_write_time, checkpoint_sync_time,
       buffers_checkpoint, buffers_clean, maxwritten_clean, buffers_backend
from pg_stat_bgwriter;

select count(*) filter (where not granted) as locks_waiting
from pg_locks;

select bl.pid as blocked_pid,
       now() - a.query_start as blocked_age,
       left(a.query, 120) as blocked_query,
       kl.pid as blocking_pid,
       left(ka.query, 120) as blocking_query
from pg_locks bl
join pg_stat_activity a on a.pid = bl.pid
join pg_locks kl on kl.locktype = bl.locktype
  and kl.database is not distinct from bl.database
  and kl.relation is not distinct from bl.relation
  and kl.page is not distinct from bl.page
  and kl.tuple is not distinct from bl.tuple
  and kl.virtualxid is not distinct from bl.virtualxid
  and kl.transactionid is not distinct from bl.transactionid
  and kl.classid is not distinct from bl.classid
  and kl.objid is not distinct from bl.objid
  and kl.objsubid is not distinct from bl.objsubid
  and kl.pid <> bl.pid
join pg_stat_activity ka on ka.pid = kl.pid
where bl.granted = false
limit 5;

select mode, count(*) as locks
from pg_locks
group by mode
order by locks desc;
SQL

  if docker compose exec -T db psql -U postgres -d ni_site -Atc "select 1 from pg_extension where extname='pg_stat_statements'" 2>/dev/null | grep -q 1; then
    log "[pg_stat_statements top]"
    docker compose exec -T db psql -U postgres -d ni_site <<'SQL' >> "$OUT" 2>&1 || true
select calls, mean_exec_time, rows, left(query, 120) as query
from pg_stat_statements
order by mean_exec_time desc
limit 5;

select calls, total_exec_time, rows, left(query, 120) as query
from pg_stat_statements
order by total_exec_time desc
limit 5;

select calls, mean_exec_time, rows, left(query, 120) as query
from pg_stat_statements
order by calls desc
limit 5;
SQL
  fi

  log "[autovacuum stats]"
  docker compose exec -T db psql -U postgres -d ni_site <<'SQL' >> "$OUT" 2>&1 || true
select relname,
       n_live_tup,
       n_dead_tup,
       last_vacuum,
       last_autovacuum,
       last_analyze,
       last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc
limit 5;
SQL

  log "[redis info]"
  docker compose exec -T redis redis-cli info stats >> "$OUT" 2>&1 || true
  docker compose exec -T redis redis-cli info clients >> "$OUT" 2>&1 || true
  docker compose exec -T redis redis-cli info memory >> "$OUT" 2>&1 || true

  sleep "$INTERVAL"
done

log "End: $(date)"
