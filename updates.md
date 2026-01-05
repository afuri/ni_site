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

0.9.11

Сделал error schema в OpenAPI согласованной с текущими ответами (request_id везде):

  Что изменилось

  - В app/api/v1/openapi_errors.py примеры ошибок теперь автоматически включают "request_id": "req-...".
  - В app/main.py обновил описание формата ошибок в OpenAPI, добавил request_id.

  Это даёт единый формат во всех response examples без правки каждого эндпойнта.

Добавил отдельную OpenAPI schema/response model для ошибок и подключил ее к response_example/response_examples.

  Изменения:

  - Новый компонент: app/schemas/errors.py с ErrorPayload и ErrorResponse.
  - app/api/v1/openapi_errors.py теперь использует ErrorResponse как model для всех ошибок.

  Теперь клиенты увидят типизированный ErrorResponse в OpenAPI. Если нужно — могу обновить отдельные эндпойнты, чтобы они ссылались на этот компонент в responses
  явно (а не только через helper).

  
0.9.12

собрал полный перечень UI‑эндпойнтов с примерами в UI_ENDPOINTS.md.

  Что внутри:

  - Полная карта эндпойнтов по группам: auth, profile, attempts, teacher/students, content, admin (tasks/olympiads/users/audit), uploads.
  - Примеры запросов/ответов.
  - Единый формат ошибок с request_id.

  Файл: UI_ENDPOINTS.md

• Добавил примеры ответов для ключевых моделей (UserRead/AttemptView и др.) в backend/UI_ENDPOINTS.md — теперь у каждого UI‑флоу есть конкретные payloads.

Добавил примеры ответов для admin‑эндпойнтов в UI_ENDPOINTS.md и расширил OpenAPI ответами с примерами для ключевых моделей (UserRead, AttemptView, TaskRead,
  OlympiadRead, ContentRead, AuditLogRead и т.д.) через общий helper.

  Изменения по коду:

  - Добавлен helper и набор примеров: backend/app/api/v1/openapi_examples.py.
  - Примеры для success‑ответов добавлены в роуты: backend/app/api/v1/auth.py, backend/app/api/v1/users.py, backend/app/api/v1/attempts.py, backend/app/api/v1/
    content.py, backend/app/api/v1/admin_tasks.py, backend/app/api/v1/admin_olympiads.py, backend/app/api/v1/admin_users.py, backend/app/api/v1/admin_audit.py,
    backend/app/api/v1/teacher.py, backend/app/api/v1/teacher_students.py.
  - Примеры для admin‑флоу в документации UI: UI_ENDPOINTS.md.

  Добавил примеры ответов для uploads и health в OpenAPI и в UI_ENDPOINTS.md.

  Что изменилось:

  - OpenAPI примеры для uploads: backend/app/api/v1/uploads.py, backend/app/api/v1/openapi_examples.py.
  - OpenAPI примеры для health: backend/app/api/v1/health.py, backend/app/api/v1/openapi_examples.py.
  - Документация с примерами: UI_ENDPOINTS.md.


0.9.13

Добавил документ по ролям/правам и ссылку в README.

  Что сделано:

  - Новый файл ROLES.md с матрицей доступа по ролям (public/student/teacher/moderator/admin) и примечаниями про OTP и бизнес‑ограничения.
  - В README.md добавлена ссылка на ROLES.md.

0.9.14

Добавил отдельный документ API_CONVENTIONS.md с правилами пагинации/фильтров/сортировки и ссылки на него в README.md и UI_ENDPOINTS.md.


0.9.14

• Готово: добавил утвержденные лимиты/типы для upload/presign в API_CONVENTIONS.md и ссылку в UI_ENDPOINTS.md.

0.9.16

Добавил явную обработку удаления задания, если оно привязано к олимпиаде: теперь ловим IntegrityError, делаем rollback и возвращаем 409 с кодом
  task_in_olympiad. Пример ошибки добавлен в OpenAPI, и ответ 409 прописан в DELETE /admin/tasks/{id}.

  Изменения:

  - Добавлен код ошибки task_in_olympiad и пример для OpenAPI: backend/app/core/error_codes.py, backend/app/api/v1/openapi_errors.py.
  - Обработка IntegrityError и 409 ответ в DELETE /admin/tasks/{id}: backend/app/api/v1/admin_tasks.py.

  - Включено: базовый URL, схема ошибки с request_id, ключевые эндпойнты и JSON‑формы, список базовых кодов ошибок, ссылки на подробные примеры в UI_ENDPOINTS.md.
  - Файл: FRONTEND_CONTRACT.md


## Необходимый update

  1. Ограничение по age_group не сработало
     Ученик studentc1 (класс 9) смог стартовать олимпиаду с age_group=7-8 (olympiad #2).
     Ожидалось: отказ доступа (409 olympiad_not_available или аналог).
     Нужно проверить логику ограничения по классу/возрасту.
  2. Модератор не может публиковать сразу при создании контента
      - POST /admin/content с publish=true от модератора возвращает publish_forbidden.
      - Но публикация через /admin/content/{id}/publish разрешена.
        Нужно либо разрешить publish=true при создании, либо документировать ограничение.

0.9.17

Исправил проверку age_group при старте попытки и разрешил модератору публиковать контент сразу при создании. В backend/app/services/attempts.py добавлена
  проверка соответствия class_grade и age_group (с учётом кэша метаданных олимпиад), чтобы 9‑й класс больше не мог стартовать 7‑8. В backend/app/services/
  content.py разрешено publish=true для модератора. Добавлены тесты для обоих кейсов в backend/tests/test_api_negative.py и backend/tests/test_api_content.py.

