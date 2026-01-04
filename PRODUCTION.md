# Production checklist

## Base runtime

- Run API with gunicorn:
  ```bash
  gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 app.main:app
  ```
- Reverse proxy (nginx/traefik) should terminate TLS and proxy to `:8000`.
- Run worker:
  ```bash
  celery -A app.core.celery_app.celery_app worker --loglevel=INFO
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

## Migrations

```bash
alembic -c alembic.ini upgrade head
```

## Observability

- `SENTRY_DSN` — enable Sentry and tags.
- `PROMETHEUS_ENABLED=true` — enable `/metrics`.
- `AUDIT_LOG_ENABLED=true` — enable audit log writes.

## Performance and limits

- Rate limits:
  - `AUTH_*_RL_*`
  - `ANSWERS_RL_LIMIT`, `ANSWERS_RL_WINDOW_SEC`
- Idempotency lock:
  - `SUBMIT_LOCK_TTL_SEC`
- Cache:
  - `OLYMPIAD_TASKS_CACHE_TTL_SEC`

## Storage/CDN

- Use S3‑compatible storage + CDN in front of it.
- Store only `image_key(s)` in DB.
- For immutable keys set long `Cache-Control`.

## Healthchecks

- API: `GET /api/v1/health`
- Metrics: `GET /metrics` (when enabled)
