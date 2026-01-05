# Production checklist

## Base runtime

- Run API with gunicorn:
  ```bash
  gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 --timeout 30 --keep-alive 5 app.main:app
  ```
- Reverse proxy (nginx/traefik) should terminate TLS and proxy to `:8000`.
- Run worker:
  ```bash
  celery -A app.core.celery_app.celery_app worker --loglevel=INFO
  ```

## Minimal nginx example

```nginx
server {
  listen 80;
  server_name example.com;

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
    proxy_connect_timeout 5s;
    client_max_body_size 10m;
  }
}
```

## Log rotation (logrotate)

```
/var/log/ni_site/api.log /var/log/ni_site/worker.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
```

## Required env vars

- `JWT_SECRET`
- `JWT_SECRETS` (optional, for rotation)
- `DATABASE_URL`
- `READ_DATABASE_URL` (optional, for read replicas)
- `REDIS_URL`
- `EMAIL_BASE_URL`
- `STORAGE_ENDPOINT`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_PUBLIC_BASE_URL`
- `APP_VERSION`

## Migrations

```bash
alembic -c alembic.ini upgrade head
```

## Docker DB checklist

- Use container networking (`db:5432`) for `DATABASE_URL`/`ALEMBIC_DATABASE_URL` in `docker-compose.yml`.
- Do not expose Postgres port publicly; keep `5432` bound only to localhost or remove host mapping.
- Run migrations inside the API container:
  ```bash
  docker exec -it ni_site-api-1 alembic -c alembic.ini upgrade head
  ```
- Backups (daily):
  ```bash
  docker exec -it ni_site-db-1 pg_dump -U postgres -d ni_site | gzip > /var/backups/ni_site/ni_site_$(date +%F).sql.gz
  ```
- Restore:
  ```bash
  gunzip -c /var/backups/ni_site/ni_site_YYYY-MM-DD.sql.gz | docker exec -i ni_site-db-1 psql -U postgres -d ni_site
  ```
- Volume persistence: ensure `pgdata` is on durable storage.
- Updates: upgrade Postgres image on maintenance window and validate backups before/after.

## Backup cron example

```bash
sudo install -d -m 700 /var/backups/ni_site
sudo tee /etc/cron.d/ni_site_db_backup >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root docker exec -i ni_site-db-1 pg_dump -U postgres -d ni_site | gzip > /var/backups/ni_site/ni_site_$(date +\%F).sql.gz
EOF
```

## Backup rotation (daily, keep 14)

```bash
sudo tee /etc/cron.d/ni_site_db_backup_rotate >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root find /var/backups/ni_site -name "ni_site_*.sql.gz" -mtime +14 -delete
EOF
```

## Backup to S3/Minio (rclone)

```bash
sudo apt-get install -y rclone
rclone config
# Create remote named "backups", type "s3", provider "Minio" or "AWS".
# Example for Minio:
# endpoint = https://minio.example.com
# access_key_id = ...
# secret_access_key = ...
```

```bash
sudo tee /etc/cron.d/ni_site_db_backup_s3 >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root docker exec -i ni_site-db-1 pg_dump -U postgres -d ni_site | gzip > /var/backups/ni_site/ni_site_$(date +\%F).sql.gz && rclone copy /var/backups/ni_site/ni_site_$(date +\%F).sql.gz backups:ni-site/db/
EOF
```


## Observability

- `SENTRY_DSN` — enable Sentry and tags.
- `PROMETHEUS_ENABLED=true` — enable `/metrics`.
- `AUDIT_LOG_ENABLED=true` — enable audit log writes.
- Sentry tags: `env`, `version`, `role`.
- Prometheus metrics: `rate_limit_blocks_total`, `attempts_started_total`, `attempts_submitted_total`.

## Performance and limits

- Rate limits:
  - `AUTH_*_RL_*`
  - `ANSWERS_RL_LIMIT`, `ANSWERS_RL_WINDOW_SEC`
  - `GLOBAL_RL_LIMIT`, `GLOBAL_RL_WINDOW_SEC`
  - `CRITICAL_RL_USER_LIMIT`, `CRITICAL_RL_USER_WINDOW_SEC`, `CRITICAL_RL_PATHS`
- Idempotency lock:
  - `SUBMIT_LOCK_TTL_SEC`
- Cache:
  - `OLYMPIAD_TASKS_CACHE_TTL_SEC`
- DB pool/timeouts:
  - `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SEC`, `DB_POOL_RECYCLE_SEC`
  - `DB_CONNECT_TIMEOUT_SEC`, `DB_STATEMENT_TIMEOUT_MS`
- Redis timeouts:
  - `REDIS_SOCKET_TIMEOUT_SEC`, `REDIS_CONNECT_TIMEOUT_SEC`
- HTTP timeouts:
  - `HTTP_CLIENT_TIMEOUT_SEC`

## Storage/CDN

- Use S3‑compatible storage + CDN in front of it.
- Store only `image_key(s)` in DB.
- For immutable keys set long `Cache-Control`.

## Healthchecks

- API: `GET /api/v1/health`
- Readiness: `GET /api/v1/health/ready`
- Queues: `GET /api/v1/health/queues`
- Metrics: `GET /metrics` (when enabled)

## Secrets management

- Dev/staging: keep secrets in `.env` and load via dotenv (Pydantic Settings).
- Production: inject secrets at runtime from Vault or 1Password (or similar) and avoid storing `.env` in the repo.
- Rotation: to rotate JWT secrets, prepend a new key to `JWT_SECRETS` and keep old keys for verification until all tokens expire.
