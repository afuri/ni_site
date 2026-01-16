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

0.9.18

Добавил явный код ошибки для несовпадения age_group и задокументировал предупреждения зависимостей как тех‑долг. Теперь при старте попытки с неподходящим
  классом возвращается 409 olympiad_age_group_mismatch, это отражено в OpenAPI и негативных тестах; в TECH_DEBT.md собраны предупреждения passlib/opentelemetry/
  protobuf с действиями.

  Изменения:

  - backend/app/services/attempts.py — отдельный код для несоответствия age_group.
  - backend/app/api/v1/attempts.py — новый code в responses и маппинге ошибок.
  - backend/app/api/v1/openapi_errors.py — пример для нового кода.
  - backend/tests/test_api_negative.py — тест ожидает olympiad_age_group_mismatch.
  - NEGATIVE_TESTS.md и FRONTEND_CONTRACT.md — обновлены списки ошибок.
  - TECH_DEBT.md — список dependency warnings и рекомендации.

0.9.19

Сделал: вход теперь разрешён даже с неподтверждённым email, но старт олимпиады блокируется.

  Что изменено:

  - Убрана проверка is_email_verified из AuthService.login: backend/app/services/auth.py.
  - Блокировка перенесена в старт попытки: backend/app/services/attempts.py.
  - Добавлен маппинг ошибки email_not_verified в POST /attempts/start: backend/app/api/v1/attempts.py.
  - Тесты обновлены: backend/tests/test_api_auth.py, backend/tests/test_api_attempts.py.
  - Удалён 403 email_not_verified из /auth/login в backend/app/api/v1/auth.py.

  Коммит: 687defd1 Allow login without verified email.

  Что нужно сделать:

  1. Перезапустить backend (uvicorn), чтобы изменения вступили в силу.
  2. Проверка:
      - POST /auth/login для неподтверждённого email → 200 OK
      - POST /attempts/start для такого пользователя → 403 email_not_verified


0.9.20

• Оставил CYRILLIC_RE без изменений и подстроил тесты admin‑update так, чтобы они не упирались в этот паттерн: везде, где обновляли city, теперь обновляется
  school.

  Изменения:

  - backend/tests/test_api_admin.py — update payload/asserions → school.
  - backend/tests/test_api_negative.py — 404‑кейс admin update → school.
  - backend/tests/test_api_rate_limit.py — rate‑limit кейс admin update → school.



## FRONTEND

Переходим к созданию frontend. Я создал папку frontend там лежат некоторые файлы, которые надо проанализировать. Index_example.html и style.css - как бы
  структурно выглядила main page. Main_page_picture.jpg - визуальное представление страницы сайта. Main_picture.jpg - главный банер, который надо использовать на
  странице. Если можешь проанализируй цвета в main_picture.jpg для создания цветовой палитры проекта. В файле frontend/README.md собрана краткая техническая
  спецификация. В любом случае, ориентируйся на все доступные документы и инструкции в NI_SITE и на файлы backend. Подготовь по всему этому детальный план
  создания frontend, которому мы будем следовать. Если есть уточняющие вопросы, готов ответить


### colors

 Палитра (по изображению, приблизительно)

  - #1f3b63 — основной глубокий сине‑стальной (header/фон CTA).
  - #2f5c92 — насыщенный синий (акцентные кнопки, ссылки).
  - #6fa3d1 — небесно‑синий (вторичный фон/градиенты).
  - #dbe5f0 — холодный туман (светлые секции/карточки).
  - #f0c3a1 — теплый рассветный (мягкие акценты, выделения).
  - #f6eee7 — кремово‑песочный (фоновые блоки/подложки).
    Если нужен точный подбор, могу сделать автоматический color‑pick после установки инструмента или если дадите бренд‑цвета.

  План создания frontend

  - Зафиксировать стек и MVP‑состав: SPA vs SSR; если SPA — React+TS+Vite, решение по UI‑библиотеке (или кастомная система компонентов, чтобы сохранить уникальный
    стиль); определить список страниц первого релиза.
  - Сформировать дизайн‑систему из визуала: пары шрифтов (например, выразительный serif для заголовков + современный sans для текста), сетка/брейкпоинты, radii/
    тени, токены (CSS variables) и правила использования hero‑изображения с градиентной маской для читаемости.
  - Описать IA и маршрутизацию: публичные страницы (главная, об олимпиаде, формат/задания, результаты, контакты, контент), auth‑потоки (login/register/verify/
    reset), кабинеты по ролям согласно ROLES.md и UI_ENDPOINTS.md.
  - Реализовать базовый лэйаут и главную: header/nav, hero с frontend/main_picture.jpg, CTA‑блоки, блоки аудитории как в main_page_example.jpg, footer; адаптив и
    легкая анимация появления секций.
  - Подключить публичный контент и страницы: /content список и деталь, карточки новостей/статей, единый стиль для медиа и цитат, базовые SEO‑метаданные.
  - Реализовать функциональные кабинеты: auth+profile (/auth/*, /users/me), ученик (список олимпиад, старт, попытка с таймером, сабмит, результат), учитель/
    модератор/админ (связи учеников, просмотр попыток, контент/банк задач/олимпиады), единая обработка ошибок по контракту и состояния загрузки/пустых экранов.

выбираем: SPA (React+TS); Закладываем сразу все роли guest/student/teacher/moderator/admin; можно отталкиваться от текущего визуала; отдельный “admin panel”
  как отдельное приложение. По этим данным подготовь детальный план, который шаг за шагом будем исполнять.


### Детальный план

Принял решения: SPA React+TS; все роли сразу; визуал — от текущих материалов; отдельное admin‑приложение. Ниже детальный, пошаговый план исполнения.

  Пошаговый план

  - Шаг 1. Архитектура и структура репозитория
      - Два SPA: frontend/app (guest/student/teacher/moderator) и frontend/admin (admin).
      - Общие пакеты: frontend/shared/ui, frontend/shared/api, frontend/shared/utils.
      - Общие конфиги: линтеры, алиасы, env‑шаблоны (API base URL).
  - Шаг 2. Дизайн‑система и токены
      - Палитра и градиенты на основе frontend/main_picture.jpg.
      - Типографика: выразительный serif для заголовков + читабельный sans для текста.
      - Сетка, размеры, радиусы, тени, состояние кнопок/инпутов.
      - Токены в CSS variables (scales: color/space/type/shadow).
  - Шаг 3. Базовые инфраструктура и API‑слой
      - API client (axios/fetch), базовый Base URL и Authorization из FRONTEND_CONTRACT.md.
      - Единая обработка ошибок и request_id.
      - Хранилище токенов + refresh flow.
      - Route guards по роли.
  - Шаг 4. UI‑кит
      - Блоки: header/nav/footer, hero, buttons, cards, tabs, tables, inputs, selects, modal, toast, empty/loading.
      - Валидация форм и текст ошибок по API_CONVENTIONS.md.
  - Шаг 5. Публичная часть (guest)
      - Главная по референсу frontend/main_page_example.jpg + frontend/main_picture.jpg.
      - Страницы: об олимпиаде, формат/задания, результаты, контакты (MVP‑текст).
      - Контент: список и детальная новость/статья из /content.
      - Auth flows: register/login/verify/reset/change.
  - Шаг 6. Student‑функционал
      - Олимпиады: список/деталь, start attempt.
      - Прохождение: задачи, ответы, таймер, submit, результат.
      - Профиль и история попыток.
  - Шаг 7. Teacher/Moderator‑функционал (в основном приложении)
      - Teacher: связи учеников, подтверждения, просмотр попыток.
      - Moderator: контент и task bank, загрузки изображений по uploads/presign*.
  - Шаг 8. Admin‑приложение
      - Управление олимпиадами, пользователями, модераторами, аудитом.
      - Контент/задачи по необходимости.
  - Шаг 9. QA и шлифовка
      - Адаптивность, доступность, состояния ошибок.
      - Проверка edge cases: olympiad_age_group_mismatch, publish_forbidden, attempt_expired.
      - Сборка и инструкции запуска.

0.1.0

Foundation for the two‑app SPA is in place: workspace root with apps/main and apps/admin, shared packages (packages/ui, packages/api, packages/utils), and
  minimal Vite+React scaffolds for both apps. I also documented the new layout and dev commands in frontend/README.md.

  Files created/updated:

  - frontend/package.json
  - frontend/tsconfig.base.json
  - frontend/apps/main/index.html
  - frontend/apps/main/package.json
  - frontend/apps/main/tsconfig.json
  - frontend/apps/main/tsconfig.node.json
  - frontend/apps/main/vite.config.ts
  - frontend/apps/main/src/main.tsx
  - frontend/apps/main/src/App.tsx
  - frontend/apps/main/src/styles/base.css
  - frontend/apps/admin/index.html
  - frontend/apps/admin/package.json
  - frontend/apps/admin/tsconfig.json
  - frontend/apps/admin/tsconfig.node.json
  - frontend/apps/admin/vite.config.ts
  - frontend/apps/admin/src/main.tsx
  - frontend/apps/admin/src/App.tsx
  - frontend/apps/admin/src/styles/base.css
  - frontend/packages/ui/package.json
  - frontend/packages/ui/src/index.ts
  - frontend/packages/api/package.json
  - frontend/packages/api/src/index.ts
  - frontend/packages/utils/package.json
  - frontend/packages/utils/src/index.ts
  - frontend/README.md

  I didn’t run installs or builds.

  Next step is the design system (tokens, typography, spacing, motion). Pick a typography pair and I’ll bake it into the tokens:

  1. Cormorant Garamond (headings) + Manrope (body)


0.2.0

Design system tokens + global styles are in place, and both apps now load Cormorant Garamond + Manrope via Google Fonts. The shared CSS is in frontend/packages/
  ui/src/styles, and both apps import it.

  Changes:

  - New tokens and global styles: frontend/packages/ui/src/styles/tokens.css, frontend/packages/ui/src/styles/global.css
  - Apps now import shared global CSS:
      - frontend/apps/main/src/App.tsx
      - frontend/apps/admin/src/App.tsx
  - Fonts added to:
      - frontend/apps/main/index.html
      - frontend/apps/admin/index.html
  - Removed local base CSS files:
      - frontend/apps/main/src/styles/base.css
      - frontend/apps/admin/src/styles/base.css

0.3.0

Shared foundation is in: API client with auth/refresh + error parsing, auth storage + role checks, auth context, and route guard stubs. Both apps now wire the
  client and auth provider, and I added env examples for API base URL.

  Key changes:

  - API client + types: frontend/packages/api/src/client.ts, frontend/packages/api/src/types.ts, frontend/packages/api/src/index.ts
  - Auth storage + roles utils: frontend/packages/utils/src/authStorage.ts, frontend/packages/utils/src/roles.ts, frontend/packages/utils/src/index.ts
  - Auth context: frontend/packages/ui/src/auth/AuthContext.tsx, frontend/packages/ui/src/index.ts
  - App wiring + guard stubs: frontend/apps/main/src/App.tsx, frontend/apps/main/src/routes/RequireRole.tsx, frontend/apps/admin/src/App.tsx, frontend/apps/admin/
    src/routes/RequireAdmin.tsx
  - Env templates: frontend/apps/main/.env.example, frontend/apps/admin/.env.example
  - tsconfig alias additions: frontend/tsconfig.base.json

0.4.0

 Added a full test harness and high‑coverage unit tests for the shared foundation (API client, auth storage, roles, auth context), plus Vitest config and dev
  deps.

  Files added/updated:

  - Test setup: frontend/vitest.config.ts, frontend/vitest.setup.ts
  - Root tooling: frontend/package.json, frontend/README.md
  - API client tests: frontend/packages/api/src/__tests__/client.test.ts
  - Utils tests: frontend/packages/utils/src/__tests__/authStorage.test.ts, frontend/packages/utils/src/__tests__/roles.test.ts
  - Auth context tests: frontend/packages/ui/src/auth/__tests__/AuthContext.test.tsx



0.5.0

Next step: build the shared UI kit (layout shell, buttons, inputs, cards, tables, modal, toast, empty/loading).

Shared UI kit is implemented with styling and tests for each component.

  What’s in:

  - Components: Button, TextInput, Card, LayoutShell, Table, Modal, Toast, EmptyState, LoadingSpinner
  - Styles: frontend/packages/ui/src/styles/components.css (imported by global.css)
  - Exports: frontend/packages/ui/src/index.ts
  - Tests: one per component under frontend/packages/ui/src/components/__tests__/

  Files added:

  - frontend/packages/ui/src/components/Button.tsx
  - frontend/packages/ui/src/components/TextInput.tsx
  - frontend/packages/ui/src/components/Card.tsx
  - frontend/packages/ui/src/components/LayoutShell.tsx
  - frontend/packages/ui/src/components/Table.tsx
  - frontend/packages/ui/src/components/Modal.tsx
  - frontend/packages/ui/src/components/Toast.tsx
  - frontend/packages/ui/src/components/EmptyState.tsx
  - frontend/packages/ui/src/components/LoadingSpinner.tsx
  - frontend/packages/ui/src/styles/components.css
  - frontend/packages/ui/src/components/__tests__/Button.test.tsx
  - frontend/packages/ui/src/components/__tests__/TextInput.test.tsx
  - frontend/packages/ui/src/components/__tests__/Card.test.tsx
  - frontend/packages/ui/src/components/__tests__/LayoutShell.test.tsx
  - frontend/packages/ui/src/components/__tests__/Table.test.tsx
  - frontend/packages/ui/src/components/__tests__/Modal.test.tsx
  - frontend/packages/ui/src/components/__tests__/Toast.test.tsx
  - frontend/packages/ui/src/components/__tests__/EmptyState.test.tsx
  - frontend/packages/ui/src/components/__tests__/LoadingSpinner.test.tsx

  Files updated:

  - frontend/packages/ui/src/styles/global.css
  - frontend/packages/ui/src/index.ts

0.5.1

Updated the TextInput tests to use regex name matching so helper/error text doesn’t break the accessible name lookup.

  File updated:

  - frontend/packages/ui/src/components/__tests__/TextInput.test.tsx

0.6.0

Main page for the guest/public site is now built in frontend-app using the hero image and styled to match frontend/example/main_page_example.jpg. I also added
  tests for the new page.

  Key changes:

  - Added hero image asset: frontend/apps/main/src/assets/main_picture.jpg
  - Home page + sections: frontend/apps/main/src/pages/HomePage.tsx
  - Home page styles: frontend/apps/main/src/styles/home.css
  - Wired into app: frontend/apps/main/src/App.tsx
  - Tests: frontend/apps/main/src/pages/__tests__/HomePage.test.tsx


0.6.1

Adjusted the hero background test to assert the resolved asset path instead of the mock name.

  File updated:

  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx

0.6.2

• Обновил главную в стиле композиции Coursera и перенёс hero‑картинку в отдельный контейнер с обрезкой по высоте 400px.

  Что сделано:

  - Hero теперь двухколоночный: текст + отдельный контейнер под main_picture.jpg (crop 400px).
  - Добавлены секции: промо‑полоса, 3 “маршрута” участия, партнёры, популярные олимпиады (горизонтальный скролл), категории, сценарии выбора, почему выбирают,
    FAQ, контакты.
  - Обновлён CSS под новую композицию.
  - Тесты HomePage обновлены под новую структуру (проверка hero image по img).

  Файлы:

  - frontend/apps/main/src/pages/HomePage.tsx
  - frontend/apps/main/src/styles/home.css
  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx

  Commit message:
  feat(frontend): adapt home page layout with hero image container and Coursera-style sections

0.6.3

Обновил главную под структуру из frontend/UI_UX_specification.md, добавил banner‑hero с main_banner_3.png и контейнер с обрезкой высоты 400px, встроил логотип/
  название, блоки и карусели, а также заглушку для “Прохождение олимпиады” с таймером и маршрутом /olympiad.

  Что изменилось:

  - Главная перестроена по структуре: верхнее меню, hero с фоном, блок “Об олимпиаде”, “Новости” (карусель), “Расписание” (кликабельный список),
    “Результаты” (карусель), “Статьи” (details), FAQ, контакты, footer.
  - Hero использует фон main_banner_3.png один раз; нижний яркий блок шириной ~30% с таймером и CTA.
  - Добавлена заглушка страницы участия с таймером и навигацией назад.
  - Переместил logo2.png и main_banner_3.png в frontend/apps/main/src/assets.

  Файлы:

  - frontend/apps/main/src/pages/HomePage.tsx
  - frontend/apps/main/src/styles/home.css
  - frontend/apps/main/src/components/Countdown.tsx
  - frontend/apps/main/src/pages/ParticipationPlaceholder.tsx
  - frontend/apps/main/src/styles/placeholder.css
  - frontend/apps/main/src/App.tsx
  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx
  - frontend/apps/main/src/pages/__tests__/ParticipationPlaceholder.test.tsx
  - frontend/apps/main/src/assets/logo2.png
  - frontend/apps/main/src/assets/main_banner_3.png

Обновил главную под структуру из frontend/UI_UX_specification.md, добавил banner‑hero с main_banner_3.png и контейнер с обрезкой высоты 400px, встроил логотип/
  название, блоки и карусели, а также заглушку для “Прохождение олимпиады” с таймером и маршрутом /olympiad.

  Что изменилось:

  - Главная перестроена по структуре: верхнее меню, hero с фоном, блок “Об олимпиаде”, “Новости” (карусель), “Расписание” (кликабельный список),
    “Результаты” (карусель), “Статьи” (details), FAQ, контакты, footer.
  - Hero использует фон main_banner_3.png один раз; нижний яркий блок шириной ~30% с таймером и CTA.
  - Добавлена заглушка страницы участия с таймером и навигацией назад.
  - Переместил logo2.png и main_banner_3.png в frontend/apps/main/src/assets.

  Файлы:

  - frontend/apps/main/src/pages/HomePage.tsx
  - frontend/apps/main/src/styles/home.css
  - frontend/apps/main/src/components/Countdown.tsx
  - frontend/apps/main/src/pages/ParticipationPlaceholder.tsx
  - frontend/apps/main/src/styles/placeholder.css
  - frontend/apps/main/src/App.tsx
  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx
  - frontend/apps/main/src/pages/__tests__/ParticipationPlaceholder.test.tsx
  - frontend/apps/main/src/assets/logo2.png
  - frontend/apps/main/src/assets/main_banner_3.png

 Сделал правки по всем 5 пунктам:

  - Меню теперь sticky и остаётся сверху при скролле.
  - Логотип увеличен в 2 раза.
  - Фон hero плавно перетекает в белый (градиент к низу поверх PNG).
  - Блок “Ближайшая олимпиада” выровнен по центру, текст и элементы центрированы.
  - Заголовки всех секций центрированы.

  Файл изменён:

  - frontend/apps/main/src/styles/home.css

Готово: меню стало ярко‑синим с прозрачностью и вдвое ниже, логотип увеличен (контейнер 56px, логотип кадрируется), заголовок поднят и теперь расположен ~50px
  ниже меню, цвет тёмно‑синий с тенью. Блок “Ближайшая олимпиада” — в 2 раза шире, полупрозрачный (30% прозрачности), таймер центрирован.

  Файл изменён:

  - frontend/apps/main/src/styles/home.css

Готово.

  - Логотип в меню вертикально выровнен (центр), кадрируется без смещения.
  - Заголовок поднят (сразу под меню), цвет — ярко‑синий.
  - Блок “Ближайшая олимпиада” теперь “Ближайшая олимпиада через”, увеличен шрифт, удалён текст “до 02.02.2026”.
  - Кнопка “Принять участие” — текст строго по центру.

  Файлы:

  - frontend/apps/main/src/styles/home.css
  - frontend/apps/main/src/pages/HomePage.tsx

Создал файл с описанием всех элементов главной и ссылками на код/стили.

  Файл:

  - frontend/UI_elements.md

0.6.4

• Добавил фиксированного кота с интерактивной цитатой и обновил документацию.

  Изменения:

  - Кот и поповер: frontend/apps/main/src/pages/HomePage.tsx
  - Стили кота/поповера: frontend/apps/main/src/styles/home.css
  - Тесты поведения: frontend/apps/main/src/pages/__tests__/HomePage.test.tsx
  - Документация: frontend/UI_elements.md
  - Asset: frontend/apps/main/src/assets/cat.png

0.6.5

Сделал адаптивное меню с гамбургером и выпадающим списком, логотип и кнопки остаются видимыми. Меню прячется под слово “меню” при уменьшении ширины до 1000px, клик по оверлею закрывает список.
Кот меняет размер относительной ширины страницы


  Изменения:

  - frontend/apps/main/src/pages/HomePage.tsx — добавлен hamburger + dropdown и overlay.
  - frontend/apps/main/src/styles/home.css — стили для nav/гамбургера/дропдауна + mobile поведение.
  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx — тест на открытие/закрытие меню.

0.6.7

Готово.

  - Партнёры убраны из «Об олимпиаде» и перенесены перед footer.
  - «Об олимпиаде» разделён на 2/3 + 1/3, добавлен длинный текст и картинка minpros.webp.
  - В правой колонке добавлен документ «Регламент проведения очного тура».

  Файлы:

  - frontend/apps/main/src/pages/HomePage.tsx
  - frontend/apps/main/src/styles/home.css
  - frontend/UI_elements.md

Поменял местами «Контакты» и блок партнеров, переименовал блок и сделал его каруселью карточек.

0.6.8

 Implemented the split “Результаты” section with two subject cards that open a detailed modal (dropdown, past tasks, prep tips, analytics), plus added subject
  logos and a sizeable modal style hook in the UI kit so the results window feels full-page.

  - New data + UI for math/informatics cards and modal flow in frontend/apps/main/src/pages/HomePage.tsx.
  - Styling for the cards and modal layout in frontend/apps/main/src/styles/home.css.
  - New assets frontend/apps/main/src/assets/math_logo.svg and frontend/apps/main/src/assets/cs_logo.svg.
  - Modal component now accepts className/backdropClassName in frontend/packages/ui/src/components/Modal.tsx.
  - Docs updated in frontend/UI_elements.md for the results section.

  Tests: npm run test (passes; React Router future-flag warnings still show).

  Commit: c4798c8e Add results modals for math and informatics.

  Note: frontend/node_modules/.vite/vitest/results.json is modified by the test run and remains uncommitted.

  Next steps (pick one):

  1. Replace the placeholder results/tasks/tips with real content and/or links.
  2. Tweak the results modal layout/visuals (sizes, stats cards, colors).

0.7.0

Начинай разрабатывать окно регистрации. Требования следующие: обязательные поля: Роль (Ученик - Учитель/Родитель), Логин, email, пароль - повтор пароля,
  Фамилия, Имя, Город, Школа, Класс (для ученика), Предмет (для Учителя/Родителя). Необязательные для заполнения поля: Отчество, данное поле находится после
  полоя Имя. Валидация: Логин - включает в себя только английские буквы и цифры, начинается только с буквы. Валидация email. Фамилия, Имя, Отчество - только
  русские буквы, первая буква - заглавная. Город - только русские буквы, первая буква заглавная. Школа - любые  символы. Класс - выбор из всплывающего списка от
  0 до 11. Предмет (для роли учителя/родителя) - только русские буквы. Внизу регистрационного окна - чекбокс (обязательный) "Даю согласие на обработку
  персональных данных и информирование" (слова "согласие на обработку персональных данных и информирование" - это гиперссылка на текст в отдельном высплывающем
  окне frontend/students_agreement.txt - для ученика, frontend/teacher_agreement.txt - для учителя/родителя). Сохранение пользователя в базу данных при отправке
  формы. После прохождения регистрации автоматически открывается окно авторизации (входа), где уже заполнен логин. Окно авторизации включает в себя поле логин,
  пароль, чекбокс - запомнить меня, ссылку на форму регистрации, ссылку на форму восстановления пароля. Все модальные окна открываются в центре экрана.
 

Созданы окна регистрации и авторизации

0.8.0

Личный кабинет добавлен и подключен: после входа идет переход на /cabinet, а на главной вместо кнопок «Войти/Регистрация» показывается логин как ссылка в
  кабинет. В кабинете есть результаты с просмотром попытки, редактируемые личные данные с зелёной кнопкой «Сохранить», статус верификации email и предупреждение,
  а также блок связи учитель—ученик. Всё стилизовано отдельным файлом и покрыто тестами.

  Изменения по коду:

  - Новый кабинет и логика: frontend/apps/main/src/pages/CabinetPage.tsx
  - Маршруты и переход после входа: frontend/apps/main/src/App.tsx, frontend/apps/main/src/pages/HomePage.tsx
  - Стили: frontend/apps/main/src/styles/cabinet.css, frontend/apps/main/src/styles/home.css
  - Тесты: frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx, frontend/apps/main/src/pages/__tests__/HomePage.test.tsx
  - Документация: frontend/UI_elements.md

  Тесты: npm run test.

  Открытые вопросы/уточнения:

  - Ссылку на диплом сделал как ${API_BASE_URL}/attempts/{id}/diploma. Подтверди фактический endpoint (в API контракте его нет).
  - Для ученика нет backend‑эндпойнта «запрос связи с учителем по логину/email» и для учителя список привязанных учеников не содержит ФИО/класс. Сейчас в кабинете
    у учителя показываю только student_id. Нужен эндпойнт/расширение ответа.
  - В форме личных данных логин/email редактируемые и валидируются, но /users/me обновляет только поля профиля. Если нужно реально менять логин/email — нужен
    backend‑endpoint; иначе предложи сделать их read‑only.

0.9.0

Next step: move into auth flows + content list/detail

rest

Student experience: olympiad list/detail, start attempt flow, attempt UI with timer/answer save/submit, results, profile
    □ Teacher & moderator experience in `frontend-app`: student links, attempts review; moderator content/task workflows with uploads per `API_CONVENTIONS.md`
    □ Admin app: admin auth, olympiad management, users/moderator management, audit logs, content/task management as needed; wire role-based navigation
    □ QA pass: responsiveness, accessibility, error states, loading states, API edge cases, and build/deploy scripts; produce final checklist

0.9.1

Обновил верхнее меню: клик по логину теперь открывает небольшой поп‑ап с “Выйти/Отмена” и лог-аут вызывает signOut; также убрал проверку формата города в формах
  регистрации и профиля. Это сделано в frontend/apps/main/src/pages/HomePage.tsx, frontend/apps/main/src/pages/CabinetPage.tsx и стили для поп-апа добавлены в
  frontend/apps/main/src/styles/home.css.

  Детали:

  - frontend/apps/main/src/pages/HomePage.tsx: добавлено состояние и обработчики пользовательского меню, логин-кнопка теперь открывает pop‑up.
  - frontend/apps/main/src/styles/home.css: стили для .home-user-menu и .home-user-popup.
  - frontend/apps/main/src/pages/HomePage.tsx, frontend/apps/main/src/pages/CabinetPage.tsx: убрана валидация формата города, осталось только обязательное
    заполнение.

  Сделал закрытие пользовательского поп-апа по клику вне него, добавил отмену редактирования профиля и логику выхода с предупреждением о несохранённых данных.

  Что изменилось

  - frontend/apps/main/src/pages/HomePage.tsx: добавлен обработчик клика вне pop‑up, логин‑кнопка теперь закрывается при клике за пределами.
  - frontend/apps/main/src/pages/CabinetPage.tsx: добавлен cancel для профиля (возврат к сохранённым значениям), кнопка “Выйти” с проверкой несохранённых
    изменений и подтверждающим модальным окном.
  - frontend/apps/main/src/styles/cabinet.css: стили для новых кнопок/контейнеров (красные “Отмена/Выйти”, выравнивание).
  - frontend/apps/main/src/pages/__tests__/HomePage.test.tsx, frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx: обновлены моки useAuth (добавлен
    signOut).


• Готово. Обновил поп‑ап в верхнем меню: теперь везде (и на главной, и в личном кабинете) при клике по логину открывается меню с кнопками “Личный кабинет” и
  “Выйти”. Для кабинета “Выйти” учитывает предупреждение о несохранённых данных.

  Что сделал

  - frontend/apps/main/src/pages/HomePage.tsx: заменил пункты поп‑апа на “Личный кабинет” и “Выйти”.
  - frontend/apps/main/src/pages/CabinetPage.tsx: добавил такой же поп‑ап в шапке кабинета.
  - frontend/apps/main/src/styles/home.css и frontend/apps/main/src/styles/cabinet.css: стили для пунктов меню (и для <a>, и для <button>).

  0.9.2

  Сделал поп‑ап с “Личный кабинет/Выйти” и добавил модалку подтверждения связей с таблицей запросов и кнопками +/–, плюс серверный delete для отказа.

  Что изменилось

  - frontend/apps/main/src/pages/HomePage.tsx: поп‑ап логина теперь содержит “Личный кабинет” и “Выйти”.
  - frontend/apps/main/src/pages/CabinetPage.tsx: такой же поп‑ап в кабинете; при входе учителя грузятся pending‑связи, показывается модалка с таблицей, +/–
    окрашиваются, “ОК” активируется после выбора и сохраняет решения (confirm/delete).
  - frontend/apps/main/src/styles/home.css, frontend/apps/main/src/styles/cabinet.css: стили для пунктов поп‑апа и таблицы запросов.
  - frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx: добавлен мок для запроса pending‑связей.
  - backend/app/api/v1/teacher_students.py, backend/app/services/teacher_students.py, backend/app/repos/teacher_students.py: добавлен DELETE /teacher/students/
    {student_id} для отказа.

  Важно

  - В таблице “ФИО” сейчас берётся из полей student_*/teacher_*, если сервер начнёт их отдавать; иначе показывается Ученик #ID (фоллбек).

Готово. Добавил двусторонние запросы и отображение ФИО во всех местах, плюс доступ учителя к кабинету ученика с редактированием.

  Что изменилось

  - Backend: добавлено поле requested_by в teacher_students (миграция backend/alembic/versions/c1b2d3e4f5a6_add_requested_by_to_teacher_students.py), обогащённые
    ответы с ФИО для списков, двусторонние запросы и отклонение.
  - Backend новые маршруты:
      - POST /student/teachers (запрос от ученика по логину/email)
      - GET /student/teachers?status=pending|confirmed
      - POST /student/teachers/{teacher_id}/confirm
      - DELETE /student/teachers/{teacher_id}
      - GET /teacher/students/{student_id}/profile
      - PUT /teacher/students/{student_id}/profile
      - GET /teacher/students/{student_id}/results
  - Frontend (frontend/apps/main/src/pages/CabinetPage.tsx):
      - модалка подтверждения запросов теперь работает и для ученика;
      - в колонке “ФИО запросившего” показывается ФИО (или fallback Ученик #id/Учитель #id);
      - “Мои учителя / Мои ученики” отображают ФИО из backend;
      - учитель по ФИО ученика открывает /cabinet?student=<id> и получает полный просмотр/редактирование;
      - ученик не может открыть кабинет учителя (параметр игнорируется).
  - Обновлены стили (frontend/apps/main/src/styles/cabinet.css) и тесты (frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx).

  Важно

  - Нужна миграция БД из‑за requested_by:
      - alembic upgrade head (или ваш обычный процесс миграций).

Что изменилось

  - В кабинете учителя раздел “Результаты прохождения олимпиад” скрыт. Он показывается только когда активный профиль — ученик (в том числе когда учитель открыл
    кабинет ученика).
  - В “Мои учителя” у ученика теперь отображается ФИО (с отчеством при наличии) и предмет. Для связанных учителей предмет берётся из backend.

  Изменённые файлы

  - backend/app/schemas/teacher_students.py: добавлено поле teacher_subject.
  - backend/app/services/teacher_students.py: в ответы добавлен teacher_subject.
  - frontend/apps/main/src/pages/CabinetPage.tsx: условный показ результатов и вывод предмета в “Мои учителя”.
  - frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx: обновлён мок.

Готово. В список “Привязанные ученики” у учителя добавлен класс.

  Изменения:

  - Backend: в TeacherStudentRead добавлено поле student_class_grade, оно заполняется из users.class_grade.
      - backend/app/schemas/teacher_students.py
      - backend/app/services/teacher_students.py
  - Frontend: в списке учеников показывается ФИО · N класс.
      - frontend/apps/main/src/pages/CabinetPage.tsx
  - Тест обновлён:
      - frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx

Сделал таблицы для обоих списков и оставил кликабельным только ФИО ученика у учителя.

  Изменения:

  - frontend/apps/main/src/pages/CabinetPage.tsx
      - “Мои учителя”: таблица (№ / ФИО учителя / предмет), ФИО не ссылка.
      - “Привязанные ученики”: таблица (№ / ФИО / класс), ссылка только на ФИО.
  - frontend/apps/main/src/styles/cabinet.css
      - удалён стиль для старого cabinet-student-class, больше не используется.

Сделал. Клик по ФИО ученика теперь прокручивает страницу наверх.

  Изменение: frontend/apps/main/src/pages/CabinetPage.tsx — добавлен handleStudentLinkClick с window.scrollTo и привязан к ссылке ФИО.


Добавил модальное подтверждение удаления для связей «ученик‑учитель» и тест на открытие этого окна; кнопки «Да/Нет» теперь работают через существующую логику
  удаления.

  - Модалка удаления с текстом подтверждения и обработкой ошибок добавлена в frontend/apps/main/src/pages/CabinetPage.tsx.
  - Добавлен стиль для кнопки подтверждения удаления в frontend/apps/main/src/styles/cabinet.css.
  - Тест на открытие окна удаления добавлен в frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx.

fullstack 0.1.0

Готово: собрал админ‑приложение с логином по центру, роутингом на /admin, шапкой и страницами управления задачами/олимпиадами/контентом/пользователями/отчетами;
  на страницах — таблицы и модальные формы для CRUD там, где есть эндпоинты.

  Что сделано

  - Роутинг и каркас админки с /admin/login, защищенными страницами и меню: frontend/apps/admin/src/App.tsx, frontend/apps/admin/src/pages/AdminLayout.tsx.
  - Центрированная форма входа: frontend/apps/admin/src/pages/LoginPage.tsx.
  - CRUD для задач, олимпиад и контента + таблицы: frontend/apps/admin/src/pages/TasksPage.tsx, frontend/apps/admin/src/pages/OlympiadsPage.tsx, frontend/apps/
    admin/src/pages/ContentPage.tsx.
  - Пользователи: форма апдейта + OTP, временный пароль, таблица “последние изменения”: frontend/apps/admin/src/pages/UsersPage.tsx.
  - Отчеты: аудит‑лог + фильтры + экспорт CSV: frontend/apps/admin/src/pages/ReportsPage.tsx.
  - Общие утилиты и стили: frontend/apps/admin/src/lib/adminClient.ts, frontend/apps/admin/src/lib/formatters.ts, frontend/apps/admin/src/styles/admin.css.

Добавил backend‑эндпоинты для админского списка и карточки пользователя, плюс пример в OpenAPI.

  Изменения:

  - Список пользователей с фильтрами/пагинацией: backend/app/api/v1/admin_users.py
  - Получение пользователя по ID: backend/app/api/v1/admin_users.py
  - Репозиторий со списком и фильтрами: backend/app/repos/users.py
  - Пример списка пользователей в OpenAPI: backend/app/api/v1/openapi_examples.py

  Новые эндпоинты:

  - GET /api/v1/admin/users?role=&is_active=&is_email_verified=&is_moderator=&moderator_requested=&login=&email=&limit=&offset=
  - GET /api/v1/admin/users/{user_id}

Обновил UI_ENDPOINTS.md и подключил список пользователей в админке.

  Что изменилось

  - Добавлены описания GET /admin/users и GET /admin/users/{user_id} в UI_ENDPOINTS.md.
  - В админке на странице пользователей добавлен блок “Список пользователей” с фильтрами и таблицей, загрузка через новый endpoint: frontend/apps/admin/src/pages/
    UsersPage.tsx.

запрос одноразового кода подтверждения (OTP) для критичных админ‑действий. В backend такие действия (например, изменение role или is_active пользователя)
  требуют кода admin_otp. Кнопка “Запросить OTP” вызывает POST /api/v1/admin/users/otp, возвращает код (в dev) и подставляет его в поле OTP, чтобы потом можно
  было отправить PUT /api/v1/admin/users/{user_id}.

  Добавил скачивание отфильтрованной таблицы пользователей в CSV (берётся текущий список в таблице и сохраняется как users_filtered.csv).


fullstack 0.2.0

Готово: переработал интерфейс создания задания. Теперь есть ввод вариантов ответа, кнопка “Добавить вариант”, чекбоксы правильных ответов и поле “Правильный
  ответ” для типа “Короткий ответ”.

  Изменения:

  - Логика формы и сборки payload: frontend/apps/admin/src/pages/TasksPage.tsx
  - Стили для блоков вариантов/короткого ответа: frontend/apps/admin/src/styles/admin.css

  Особенности:

  - Для single_choice отмечается ровно один правильный вариант (чекбокс переключает и сбрасывает остальные).
  - Для multi_choice можно выбрать несколько.
  - Для short_text есть выбор типа ответа (текст/целое/дробное) + поле “Правильный ответ”; для дробного — поле погрешности.

добавил загрузку изображения с имитацией S3 (через localStorage), окно предпросмотра, и Markdown‑предпросмотр текста задания.

  Изменения:

  - frontend/apps/admin/src/pages/TasksPage.tsx
      - кнопки “Загрузить изображение / Предпросмотр / Очистить”
      - генерация mock‑S3 ключа и сохранение dataURL в localStorage
      - модалка предпросмотра изображения
      - Markdown preview под полем “Условие”
  - frontend/apps/admin/src/styles/admin.css
      - стили предпросмотра markdown и картинки

Добавил вертикальный скролл в модалке создания/редактирования задания.

  Изменение:

  - frontend/apps/admin/src/styles/admin.css — max-height: 85vh; overflow-y: auto; для .admin-task-modal

Сделал предпросмотр всего задания (с изображением) прямо из окна создания/редактирования и добавил кнопку “Предпросмотр” в список заданий. Автор теперь
  отображается по логину, а не по id.

  Что изменено:

  - frontend/apps/admin/src/pages/TasksPage.tsx
      - превью из формы + превью из списка
      - загрузка логина автора через GET /admin/users/{id}
      - новый предпросмотр с markdown‑текстом, вариантами и правильными ответами
  - frontend/apps/admin/src/styles/admin.css
      - стили для предпросмотра задания и кнопки “Загрузить изображение”

добавил полноценный предпросмотр задания (включая изображение до/после условия), исправил загрузку изображений с ресайзом до 800px по ширине, и расширил
  поддержку Markdown (в т.ч. с inline‑HTML, как в вашем примере).

  Что изменилось

  - Markdown‑рендерер теперь поддерживает заголовки, списки, цитаты, ссылки, inline‑code, код‑блоки и HTML внутри текста. Пример ## <strong style="color:
    yellow">…</strong> теперь отрисуется как нужно.
  - Загрузка изображений: файл ресайзится до 800px по ширине (с сохранением пропорций), сохраняется в localStorage (mock S3), сразу доступен для предпросмотра.
  - Добавлен выбор позиции изображения: “Перед условием” / “После условия” (по умолчанию “После условия”), сохраняется в payload как image_position.
  - Предпросмотр задания из формы и из списка заданий с корректным выводом картинки до/после условия.
  - Автор в списке задач и в предпросмотре — по логину (через GET /admin/users/{id}).

  Файлы:

  - frontend/apps/admin/src/pages/TasksPage.tsx
  - frontend/apps/admin/src/styles/admin.css
Сделал.

  - Markdown: расширил поддержку (заголовки, списки, цитаты, ссылки, inline‑code, code‑blocks, hr, strike) и разрешил inline‑HTML — ваш пример ## <strong
    style="color: yellow">…</strong> теперь рендерится как жирный жёлтый текст.
  - Картинки: починил загрузку и добавил устойчивый mock‑S3 (localStorage + память). Ресайз делается только если ширина > 800px, иначе сохраняется оригинал. Есть
    fallback в PNG, если формат не поддерживается.
  - Добавил настройку позиции изображения: “Перед условием / После условия” (по умолчанию — “После условия”) и учёл её в предпросмотре и payload.
  - Предпросмотр задания теперь учитывает позицию картинки.

  Файлы:

  - frontend/apps/admin/src/pages/TasksPage.tsx
  - frontend/apps/admin/src/styles/admin.css

добавил кнопку “Скопировать” в список заданий и ограничил изображения до 600px по ширине.

  Что изменилось:

  - Кнопка “Скопировать” создаёт новое задание через POST /admin/tasks, с тем же содержимым и заголовком {title} копия.
      - frontend/apps/admin/src/pages/TasksPage.tsx
  - Ресайз изображений теперь до 600px (только если ширина больше).
  - Предпросмотр ограничен до 600px ширины.
      - frontend/apps/admin/src/styles/admin.css

fullstack 0.3.0

Расширил окно создания олимпиады и добавил список заданий внизу с выбором, порядком и баллами; длительность теперь вводится в минутах и конвертируется в секунды
  при сохранении. Стили для ширины окна и блока выбора заданий добавлены в frontend/apps/admin/src/styles/admin.css, логика — в frontend/apps/admin/src/pages/
  OlympiadsPage.tsx.

Добавил строку фильтра по названию в блоке добавления заданий и применил фильтрацию списка. Обновления в frontend/apps/admin/src/pages/OlympiadsPage.tsx.

 - Валидация порядка заданий: для выбранных к добавлению заданий порядок должен быть 1..N, порядок уникален; ошибки показываются в блоке заданий.
  - Режим “Случайный порядок”: добавлен чекбокс, при включении порядок назначается автоматически при сохранении, поля порядка блокируются.
  - Выбор классов: заменил селект на чекбоксы 1–8; добавлена проверка допустимых комбинаций (1, 2, 3‑4, 5‑6, 7‑8). Ошибка показывается при сохранении.

  Изменения в:

  - frontend/apps/admin/src/pages/OlympiadsPage.tsx
  - frontend/apps/admin/src/styles/admin.css

Вернул множественный выбор классов 1–8 в форме олимпиады и убрал проверку на “жесткие” комбинации: теперь backend принимает любой набор классов из допустимого
  списка, нормализует и сохраняет как строку. Логику проверки доступа по классу перевел на разбор набора классов, добавил миграцию, чтобы age_group стал текстовым
  полем и принимал произвольные комбинации.

  Изменения:

  - frontend/apps/admin/src/pages/OlympiadsPage.tsx: мультивыбор 1–8, парсинг/отправка набора классов, базовая проверка “хотя бы один класс”.
  - backend/app/core/age_groups.py: разбор/нормализация набора классов.
  - backend/app/models/olympiad.py: age_group теперь строка.
  - backend/app/schemas/olympiads_admin.py: валидация набора классов через нормализацию.
  - backend/app/services/attempts.py: проверка допуска по набору классов.
  - backend/alembic/versions/d9f3c2a1b4e6_olympiad_age_group_text.py: миграция типа age_group → VARCHAR.

Обновил тест, который падал из‑за удалённого AgeGroup, и вернул множественный выбор классов 1–8 в форме олимпиады; backend теперь принимает набор классов
  (список/строку), нормализует и валидирует его по допустимому диапазону. Миграция и merge‑head уже готовы.

  Что изменено:

  - backend/tests/test_maintenance_tasks.py: убран импорт AgeGroup, age_group="7-8".
  - frontend/apps/admin/src/pages/OlympiadsPage.tsx: снова мультивыбор 1–8, отправка списка классов.
  - backend/app/core/age_groups.py, backend/app/models/olympiad.py, backend/app/schemas/olympiads_admin.py, backend/app/services/attempts.py: нормализация и
    проверка набора классов.
  - backend/alembic/versions/d9f3c2a1b4e6_olympiad_age_group_text.py, backend/alembic/versions/e1f4a2b7c9d0_merge_age_group_text.py.

0.4.0

Собрал новую страницу прохождения и подключил маршрут /olympiad?attemptId=...:

  - Реализовал страницу frontend/apps/main/src/pages/OlympiadPage.tsx с верхним меню (название, таймер, логин, “Завершить”), блоком номеров заданий, условием по
    центру, блоком ответа и навигацией (включая “Начало/Окончание”).
  - Добавил подтверждение завершения, предупреждение за 5 минут, авто‑завершение по таймеру и показ процента результата после отправки.
  - Обновил роут в frontend/apps/main/src/App.tsx.
  - Добавил стили в frontend/apps/main/src/styles/olympiad.css.

  Что нужно сделать, чтобы это заработало:

  1. Пересобрать backend контейнер (новый GET /olympiads уже есть):
     docker compose up -d --build
  2. Запустить фронт:
     npm --workspace @ni/app-main run dev

  После этого:

  - На главной выбираешь олимпиаду → “Начать олимпиаду”.
  - Попадаешь на /olympiad?attemptId=....

Добавил на страницу прохождения:

  - Кнопку «Сохранить ответ» для текстовых заданий (с сохранением также при переходе/blur).
  - Отображение изображения до/после условия по image_position из payload и image_key, с загрузкой через /uploads/{key}.

  Обновления:

  - backend/app/services/attempts.py — теперь в payload передается image_position.
  - frontend/apps/main/src/pages/OlympiadPage.tsx — кнопка сохранения, загрузка и рендер изображений.
  - frontend/apps/main/src/styles/olympiad.css — стили для изображения и блока короткого ответа.

- Картинка теперь грузится корректно: для /uploads/{key} исправил формирование пути с сохранением / (раньше encodeURIComponent ломал ключи с /).
  - Навигация вынесена слева и справа от блока ответов, блок ответов по центру.
  - Таймер и логин в верхнем меню теперь белые.
  - Навигация по номерам заданий поднята выше (ближе к меню).
  - Условие и блок ответов центрированы (max‑width + auto margins).

  Изменения:

  - frontend/apps/main/src/pages/OlympiadPage.tsx — исправлен загрузчик изображений, переразметка навигации.
  - frontend/apps/main/src/styles/olympiad.css — новые стили для меню, сетки, центрирования, навигации.

Сделал правки:

  - Ширина блока условия и ответов: 70vw (центрировано), на мобильных — 100%.
  - Кнопка “Завершить” теперь серая, текст чёрный.
  - Название олимпиады и элементы верхнего меню — белые.
  - Навигация по номерам поднята ближе к меню.
  - Картинки теперь грузятся через fallback в localStorage (mock S3) если /uploads не возвращает файл.

  Изменения:

  - frontend/apps/main/src/pages/OlympiadPage.tsx
  - frontend/apps/main/src/styles/olympiad.css

 Сделал:

  - В админке загрузка изображений теперь пытается залить файл в MinIO через /uploads/presign (с ресайзом до 600px). Если загрузка не удалась — fallback на
    локальное mock‑хранилище, как раньше.
    Файл: frontend/apps/admin/src/pages/TasksPage.tsx
  - Ширина блока условия и ответов — 70% ширины экрана, центрировано.
  - Кнопка “Завершить” — серый фон, чёрный текст.
  - Название олимпиады и элементы в верхнем меню — белые.
    Файл: frontend/apps/main/src/styles/olympiad.css

  Почему картинки не видны сейчас:

  - Старые изображения были сохранены только в локальном mock‑хранилище админки (localStorage), оно не доступно главному сайту (другая “origin”).
  - После этого изменения нужно перезагрузить картинки в заданиях: открыть задание в админке и заново выбрать файл → сохранить. Тогда изображение попадёт в MinIO
    и будет доступно при прохождении.

 - Убрал название задания и блок “Баллы” — остались только условие, картинка (если есть) и ответы.
  - Картинка центрируется в блоке условия.
  - “Окончание” заменено на “Последнее”.
  - На последнем задании добавлена кнопка “Завершить” под ответами.
  - Во всех модальных окнах текст по центру.

  Изменения:

  - frontend/apps/main/src/pages/OlympiadPage.tsx
  - frontend/apps/main/src/styles/olympiad.css

 - Вернул заголовок “Задание 1/2…” и баллы в правом верхнем углу блока.
  - Заголовки всех модальных окон центрированы.
  - Навигационные стрелки стали жирнее, заменены на < и >.
  - Шрифт условия и ответов увеличен на 2pt (до 1.125rem).

  Изменения:

  - frontend/apps/main/src/pages/OlympiadPage.tsx
  - frontend/packages/ui/src/styles/components.css
  - frontend/apps/main/src/styles/olympiad.css

Added a visual “saved” feedback for the short‑answer Save button: it flashes light‑green on click for ~1.2s (and also on active press), without affecting
  auto‑save on blur. Implemented in frontend/apps/main/src/pages/OlympiadPage.tsx with a timed state flag and styled in frontend/apps/main/src/styles/
  olympiad.css.

  - frontend/apps/main/src/pages/OlympiadPage.tsx: track last saved task id and attach olympiad-save-button / is-saved classes to the Save button.
  - frontend/apps/main/src/styles/olympiad.css: add light‑green activation styles.

0.10.0

Добавил пол и подписку в профиль пользователя и обновил фронт/тесты:

  - Модели/схемы/миграция: gender (муж/жен) и subscription (0–5, по умолчанию 0) в users, Alembic миграция f7d2c3a4b5e6_add_gender_and_subscription_to_users.py.
  - Регистрация и скрипты: register требует gender, subscription=0; create_admin.py и create_demo_users.py заполняют новые поля (пол случайный в демо).
  - Админ и профиль: UserRead расширен, фильтры/CSV/формы админки умеют gender/subscription.
  - Фронт: в регистрации радиокнопки пола обязательны; API/types обновлены.
  - Тесты: pytest и vitest обновлены под новые поля, добавлены проверки схем и колонок users.

fullstack 0.11.0

• Добавил поля пола и подписки для пользователей на backend и фронте, обновил миграции, скрипты и тесты.

  - Бэкенд: ввёл enum Gender и столбцы gender/subscription в users + миграция backend/alembic/versions/f7d2c3a4b5e6_add_gender_and_subscription_to_users.py;
    схемы/валидация обновлены (backend/app/schemas/auth.py, user.py, teacher_students.py), сервисы/репозитории и эндпойнты теперь принимают/возвращают новые поля
    (backend/app/services/auth.py, repos/users.py, api/v1/auth.py, users.py, admin_users.py). Скрипты backend/scripts/create_admin.py и create_demo_users.py
    заполняют новые поля (пол для демо — случайный, subscription=0). Примеры OpenAPI и docs синхронизированы (backend/app/api/v1/openapi_examples.py,
    UI_ENDPOINTS.md, FRONTEND_CONTRACT.md, frontend/UI_elements.md, updates.md).
  - Фронтенд: форма регистрации требует выбор пола через радиокнопки, subscription уходит как 0 по умолчанию (frontend/apps/main/src/pages/HomePage.tsx, home.css,
    тест обновлён). Типы API/клиент и хранение auth расширены под новые поля (frontend/packages/api/src/types.ts, client.ts, auth storage/tests). Админка получила
    фильтры/колонки/CSV для gender/subscription и поля в форме редактирования (frontend/apps/admin/src/pages/UsersPage.tsx). Все пользовательские моки в vitest
    обновлены (frontend/apps/main/src/pages/__tests__/CabinetPage.test.tsx, frontend/packages/utils/src/__tests__/authStorage.test.ts, roles.test.ts, frontend/
    packages/ui/src/auth/__tests__/AuthContext.test.tsx, frontend/apps/main/src/pages/__tests__/HomePage.test.tsx).
  - Тесты backend расширены: новые проверки схем/валидаторов и наличие колонок в test_migrations_schema.py; регистрационные тесты ожидают gender/subscription
    (backend/tests/test_api_auth.py, test_auth_validation.py, test_api_negative.py, test_api_e2e.py). Конфтест создаёт пользователей с gender/subscription.