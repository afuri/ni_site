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
- `DATABASE_URL`
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
- Metrics: `GET /metrics` (when enabled)
