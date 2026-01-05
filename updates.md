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


0.7.0

Next step: move into auth flows + content list/detail

rest

Student experience: olympiad list/detail, start attempt flow, attempt UI with timer/answer save/submit, results, profile
    □ Teacher & moderator experience in `frontend-app`: student links, attempts review; moderator content/task workflows with uploads per `API_CONVENTIONS.md`
    □ Admin app: admin auth, olympiad management, users/moderator management, audit logs, content/task management as needed; wire role-based navigation
    □ QA pass: responsiveness, accessibility, error states, loading states, API edge cases, and build/deploy scripts; produce final checklist

