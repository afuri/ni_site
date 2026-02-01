# Проверка сервера без нагрузки (пункты 1–5)

Ниже — команды и краткая интерпретация для определения потенциального bottleneck **без нагрузки**.  
Запускайте на сервере (root). Если утилиты нет — отметьте это в ответе.

---

## 1) Аппаратные лимиты (CPU / RAM / диск)

**Команды:**
```bash
uname -a
nproc
lscpu | egrep 'Model name|CPU\(s\)|Thread|Core|Socket|MHz'
free -h
df -hT
vmstat 1 5
# если доступно:
iostat -xz 1 3
mpstat -P ALL 1 3
```

**Как интерпретировать:**
- `vmstat`:  
  - `r` стабильно больше числа CPU → очередь на CPU.  
  - `wa` > 5% → упирается в диск.  
- `iostat`:  
  - `%util` > 70% и растет `await` → диск узкое место.  
- `free`:  
  - мало `available` даже в простое → риск по памяти.

---

## 2) Конфигурация Nginx и лимиты

**Команды:**
```bash
nginx -T 2>/dev/null | egrep -i 'worker_processes|worker_connections|worker_rlimit_nofile|keepalive_timeout|keepalive_requests'
nginx -T 2>/dev/null | egrep -i 'open_file_cache|ssl_session_cache|ssl_session_timeout'
systemctl show nginx -p LimitNOFILE
cat /proc/$(pgrep -o nginx)/limits | grep -i "Max open files"
```

**Как интерпретировать:**
- Потенциальный максимум одновременных соединений ≈ `worker_processes * worker_connections`.  
- `LimitNOFILE` и `Max open files` должны быть **выше** этой оценки, иначе очереди/ошибки по соединениям.  
- Отсутствие `keepalive_*` и `open_file_cache` — хуже для статики и TLS‑reuse.

---

## 3) Сеть / TCP

**Команды:**
```bash
ss -s
ss -tan state time-wait | wc -l
ss -tan state syn-recv | wc -l
sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.ip_local_port_range net.ipv4.tcp_fin_timeout
```

**Как интерпретировать:**
- Много `SYN-RECV` → риск очередей на входе (малые `somaxconn`/`tcp_max_syn_backlog`).  
- Очень много `TIME-WAIT` → много коротких соединений, стоит улучшать keep‑alive.  
- Узкий `ip_local_port_range` может ограничивать исходящие соединения.

---

## 4) База данных (Postgres)

**Команды:**
```bash
docker compose exec db psql -U postgres -d ni_site -c "select datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit, round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2) as hit_ratio from pg_stat_database where datname='ni_site';"
docker compose exec db psql -U postgres -d ni_site -c "select checkpoints_timed, checkpoints_req, checkpoint_write_time, checkpoint_sync_time, buffers_checkpoint, buffers_backend, buffers_backend_fsync, maxwritten_clean from pg_stat_bgwriter;"
docker compose exec db psql -U postgres -d ni_site -c "select count(*) filter (where state='active') as active, count(*) filter (where wait_event is not null) as waiting, count(*) as total from pg_stat_activity;"
docker compose exec db psql -U postgres -d ni_site -c "select state, wait_event_type, wait_event, count(*) from pg_stat_activity group by 1,2,3 order by 4 desc;"
docker compose exec db psql -U postgres -d ni_site -c "select count(*) from pg_stat_activity where wait_event_type='Lock';"
```

**Как интерпретировать:**
- `hit_ratio` < 95% → узкое место в диске/кеше.  
- Много `checkpoints_req` → частые forced‑checkpoints, риск просадок.  
- `wait_event_type='Lock'` > 0 → блокировки, риск bottleneck.  
- `idle/ClientRead` — нормально (ожидают клиента).

---

## 5) API (воркеры/ресурсы)

**Команды:**
```bash
docker top ni_site-api-1 -o pid,ppid,cmd
docker stats --no-stream ni_site-api-1 ni_site-worker-1 ni_site-db-1
```

**Как интерпретировать:**
- `docker top`: количество uvicorn‑воркеров.  
- `docker stats`: если CPU/API уже высок при простое → мало запаса.  

