0.9.8

  - Автобутстрап БД для dev/stage: backend/scripts/bootstrap_db.py проверяет таблицы, при пустой схеме делает reset и запускает Alembic.
  - Удалил backend/dot.env, чтобы не было путаницы с конфигами.
  - Read‑replica health + метрика ошибок: backend/app/api/v1/health.py, backend/app/core/metrics.py.
  - request_id в ответах ошибок, в audit‑логах и Sentry: backend/app/main.py, backend/app/middleware/audit.py, backend/app/models/audit_log.py, backend/app/repos/
    audit_logs.py, backend/app/schemas/audit.py, backend/alembic/versions/8f4a2b3c1d2e_add_request_id_to_audit_logs.py.
  - Тесты: backend/tests/test_maintenance_tasks.py, backend/tests/test_migrations_schema.py.
  - Документация и команды: PRODUCTION.md, Service_commands.md.

  Ключевые пути

  - Bootstrap: backend/scripts/bootstrap_db.py
  - Health read replica: backend/app/api/v1/health.py
  - Request ID middleware/logging: backend/app/middleware/request_id.py, backend/app/core/logging.py
  - Миграция audit request_id: backend/alembic/versions/8f4a2b3c1d2e_add_request_id_to_audit_logs.py


  0.9.9

   Изменения по коду

  - Bootstrap/reset
      - backend/scripts/bootstrap_db.py — dev/stage bootstrap (пустая схема → reset → alembic).
      - backend/scripts/db_reset.py — явный reset (только dev/stage).
  - ENV‑валидация
      - backend/app/core/config.py — validate_required_settings.
      - backend/app/main.py — fail‑fast для prod/stage, warning для dev.
  - Read‑replica health + fallback
      - backend/app/api/v1/health.py — read‑DB check + метрики.
      - backend/app/core/deps.py — fallback на write при проблемах read‑DB.
      - backend/app/core/metrics.py — read_db_fallback_total.
  - Tracing + корреляция
      - backend/app/core/tracing.py — OpenTelemetry setup.
      - backend/app/main.py — tracing init + FastAPI instrumentation.
      - backend/app/core/logging.py — trace_id в JSON‑логах.
      - backend/app/middleware/request_id.py — request_id в span attributes.
      - backend/app/middleware/audit.py — trace_id tag в Sentry.
      - backend/requirements.txt — opentelemetry пакеты.
  - Audit logs retention + индекс
      - backend/app/tasks/maintenance.py — cleanup audit logs.
      - backend/app/core/celery_app.py — beat расписание.
      - backend/alembic/versions/5a1c9b8d7e6f_add_audit_request_id_index.py — индекс request_id.
  - Тесты
      - backend/tests/test_maintenance_tasks.py — cleanup auth + audit retention + warmup.
      - backend/tests/test_migrations_schema.py — наличие request_id.
      - backend/tests/test_api_admin.py — service token.
      - backend/tests/test_api_negative.py — OTP required для admin‑таргета.
  - Документация
      - PRODUCTION.md, Service_commands.md — bootstrap/reset, env‑минимум.
  - Конфиги
      - .env, .env.example — OTEL, audit retention, cleanup interval.

  Что важно:

  - Удалил backend/dot.env (чтобы не путать источники конфигов).
  - request_id всегда в заголовке; для ошибок добавлен в JSON body.
  - Read‑replica fallback: если read‑DB недоступна, GET автоматически идут в write с метрикой.

0.9.10 Стабилизацию пункта 1 сделал: теперь для clean‑DB используется bootstrap‑скрипт без ручных reset, и это закреплено в доке.

  Что работает теперь

  - backend/scripts/bootstrap_db.py сам проверяет схему и, если таблиц приложения нет, в dev/stage делает безопасный reset + alembic upgrade head.
  - Для docker‑старта команда в Service_commands.md заменена на bootstrap.

  Как использовать

  - Локально:
      - python backend/scripts/bootstrap_db.py
  - Docker:
      - docker compose exec api python /app/scripts/bootstrap_db.py
      - docker compose exec api python /app/scripts/create_admin.py

  Условие безопасности

  - Авто‑reset выполняется только если ENV=dev или ENV=stage. В prod скрипт откажется трогать схему.





