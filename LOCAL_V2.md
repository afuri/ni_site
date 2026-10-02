# Локальный запуск NI_SITE v2

Рабочая папка: `/Users/alexfedosov/Documents/ni_site_v2`.
Все Docker-команды ниже используют `docker-compose.local.yml` и локальные данные.
Docker Desktop должен быть запущен.

Актуальная версия включает новый личный кабинет, справочник Region → City → School,
обработку заявок на школы, изменение ролей и удаление пользователей с очисткой дипломов.
Для полного запуска нужны API, PostgreSQL, Redis, MinIO, Celery worker и Celery beat,
а также два frontend-сервера: основное приложение и админка.

## 1. Подготовка окружения

Перейдите в папку проекта и проверьте рабочую ветку:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
git branch --show-current
docker compose version
docker info
```

Рабочая ветка — `codex/v2-development`. Файл `.env.local` должен находиться в корне
проекта и содержать настройки локальных контейнеров. Не заменяйте его production-файлом
и не публикуйте в Git.

Основные адреса внутри Docker:

- PostgreSQL: `db:5432`, база `ni_site`;
- Redis: `redis:6379`;
- Celery broker/result backend: локальный Redis, обычно базы 1 и 2;
- MinIO: `http://minio:9000`, бакет `ni-site`;
- публичный адрес файлов для браузера: `http://127.0.0.1:9000/ni-site`.

Внутри контейнеров `localhost` указывает на сам контейнер. Настройки отправки писем
и внешних систем мониторинга для локальной разработки должны оставаться отключёнными.
Это особенно важно при работе с восстановленной production-БД.

Frontend использует `VITE_API_BASE_URL`. Примеры настроек находятся в
`frontend/apps/main/.env.example` и `frontend/apps/admin/.env.example`.
Для локального dev-сервера удобно значение `/api/v1`: Vite проксирует запросы
на `http://127.0.0.1:8000`. Не перезаписывайте существующие файлы настроек.

## 2. Полный запуск после обновления кода

Выполняйте этот порядок при первом запуске и после изменений backend или схемы БД.

### 2.1. Запустить инфраструктуру

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml up -d --wait db redis minio
docker compose -f docker-compose.local.yml up -d minio_init
```

`minio_init` создаёт бакет и настраивает доступ к файлам. После успешного выполнения
этот контейнер может иметь статус `Exited (0)` — это нормально.

### 2.2. Собрать API и worker

```bash
docker compose -f docker-compose.local.yml --profile worker build api worker
```

API и worker собираются из одного backend, но являются разными сервисами.
При изменении серверного кода обновляйте оба образа.

### 2.3. Остановить старый API и worker перед миграцией

Если Celery beat уже запущен в отдельном терминале, сначала остановите его через
`Control+C`. Затем:

```bash
docker compose -f docker-compose.local.yml --profile worker stop api worker
```

### 2.4. Применить миграции из нового образа

```bash
docker compose -f docker-compose.local.yml run --rm --no-deps api alembic upgrade head
docker compose -f docker-compose.local.yml run --rm --no-deps api alembic current
```

Эти команды запускают временный контейнер из пересобранного образа API, поэтому
миграция доступна даже если основной API ещё не запущен.

После изменений удаления пользователей ожидается версия `c9d8e7f6a5b4 (head)`.
При появлении следующих миграций используйте `upgrade head`; номер версии может измениться.
Миграция создаёт таблицы заявок и очереди очистки файлов, сама пользователей не удаляет.

### 2.5. Запустить обновлённые API и worker

```bash
docker compose -f docker-compose.local.yml --profile worker up -d api worker
docker compose -f docker-compose.local.yml --profile worker ps
```

Проверка API и очередей:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/health/ready
curl -fsS http://127.0.0.1:8000/api/v1/health/queues
```

Проверка миграции работающего контейнера:

```bash
docker compose -f docker-compose.local.yml exec -T api alembic current
```

## 3. Celery beat: автоматические фоновые проверки

В `docker-compose.local.yml` отдельного сервиса beat нет.
Запустите его в отдельном окне Терминала после миграции и запуска worker:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker run --rm --no-deps worker \
  celery -A app.core.celery_app.celery_app beat --loglevel=INFO \
  --schedule /tmp/ni-site-v2-celerybeat-schedule
```

Этот процесс остаётся в терминале. Остановка — `Control+C`.
Запускайте только один экземпляр beat для локального окружения.

Worker исполняет задачи, beat отправляет их по расписанию. Для автоматического
повтора очистки дипломов удалённых аккаунтов нужны оба процесса. Повтор выполняется
каждые 5 минут. При отсутствии beat первоначальная попытка удаления файлов и ручная
кнопка повторной очистки в админке работают, автоматический повтор не выполняется.
Beat также запускает другие включённые в настройках maintenance-задачи проекта.

При пересборке worker остановите beat и запустите его заново этой командой,
чтобы он использовал новый образ.

## 4. Запуск frontend для разработки

### 4.1. Зависимости

При первом запуске или после изменения зависимостей:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm ci
```

### 4.2. Основное приложение

В отдельном терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-main run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Адрес: http://127.0.0.1:5173/

### 4.3. Админ-панель

Ещё в одном терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-admin run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Адрес: http://127.0.0.1:5174/admin/

`--strictPort` предотвращает незаметный запуск на другом порту, если выбранный порт занят.
Vite автоматически подхватывает изменения исходников. После изменения `VITE_*`
переменных перезапустите соответствующий frontend-сервер.
Coins в новом личном кабинете остаются скрыты при `VITE_ENABLE_PLATFORM_COINS=false`.

## 5. Сборка frontend и просмотр собранной версии

Сборка обоих приложений:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm run build:app
npm run build:admin
```

Результаты: `frontend/apps/main/dist` и `frontend/apps/admin/dist`.
Docker-команды сборки API/worker не собирают frontend.

Чтобы просмотреть сборки, остановите dev-серверы на тех же портах через `Control+C`.
Запустите preview каждого приложения в отдельном терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-main run preview -- --host 127.0.0.1 --port 5173 --strictPort
```

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-admin run preview -- --host 127.0.0.1 --port 5174 --strictPort
```

Адреса остаются такими же, как в dev-режиме. API должен работать.
После изменения исходников preview требует повторной сборки.

## 6. Короткие команды пересборки

Если изменён только серверный код и новая миграция не требуется:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker up -d --build api worker
```

Только API:

```bash
docker compose -f docker-compose.local.yml up -d --build api
```

Только worker:

```bash
docker compose -f docker-compose.local.yml --profile worker up -d --build worker
```

Если новая миграция требуется, используйте порядок из раздела 2:
сборка → остановка старых процессов → миграция → запуск.
Одной пересборки frontend недостаточно для новых API, смены ролей и удаления аккаунтов.

## 7. Остановка и повторный запуск

Frontend и Celery beat остановите через `Control+C` в их терминалах.
Сервисы Docker остановите без удаления данных:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker stop
```

Повторный запуск без изменений кода:

```bash
docker compose -f docker-compose.local.yml --profile worker up -d
docker compose -f docker-compose.local.yml --profile worker ps
```

Затем отдельно запустите beat и два frontend-сервера по разделам 3–4.
Не используйте `docker compose down -v`: это удалит тома локальной БД и MinIO.

## 8. Диагностика и проверки

Состояние контейнеров:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker ps -a
```

Последние логи API и worker:

```bash
docker compose -f docker-compose.local.yml --profile worker logs --tail=100 api worker
```

Логи в реальном времени (выход через `Control+C`):

```bash
docker compose -f docker-compose.local.yml --profile worker logs --tail=100 -f api worker
```

Проверка БД и Redis:

```bash
docker compose -f docker-compose.local.yml exec -T db pg_isready -U postgres -d ni_site
docker compose -f docker-compose.local.yml exec -T redis redis-cli ping
```

Проверка frontend:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-main run typecheck
npm --workspace @ni/app-admin run typecheck
npm test -- --no-cache
```

Для проверки новых функций используйте тестовые аккаунты:
в админке проверьте смену роли, обновление школы по ID и список заявок на удаление;
в личном кабинете — отправку и отмену заявки. Удаление аккаунта безвозвратно удаляет
его рабочие данные. Если MinIO недоступен, файлы остаются в очереди очистки;
статус очереди отображается в разделе удаления пользователей.

Подробнее: [Удаление аккаунтов](docs/account-deletion.md),
[Переходы ролей](docs/user-role-transitions.md),
[Обновление школы из заявки](docs/school-submission-update.md).

## 9. Локальные адреса

| Сервис | Адрес |
| --- | --- |
| Основное приложение | http://127.0.0.1:5173/ |
| Админ-панель | http://127.0.0.1:5174/admin/ |
| API | http://127.0.0.1:8000/api/v1 |
| Swagger | http://127.0.0.1:8000/docs |
| MinIO Console | http://127.0.0.1:9001/ |
| PostgreSQL с хоста | `127.0.0.1:5433` |
| Redis с хоста | `127.0.0.1:6380` |

Локальные пароли находятся в `.env.local`.

## 10. Справочник Region → City → School

Если каталог уже импортирован в локальную БД, повторный импорт не нужен.
Первичный импорт в подготовленную БД начинается с dry-run:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
./manual_scripts/import_school_directory.sh \
  --compose-file docker-compose.local.yml \
  --schools temporary/ni_schools.csv \
  --users temporary/user_school.csv \
  --batch-id local-check-YYYYMMDD \
  --dry-run
```

Замените `YYYYMMDD` на дату. Dry-run не применяет изменения.
Импортёр требует пустой новый каталог, поэтому его нельзя повторно применять
к заполненной основной локальной БД.

Проверка после успешно завершённого первичного импорта:

```bash
docker compose -f docker-compose.local.yml exec -T db \
  psql -U postgres -d ni_site -v ON_ERROR_STOP=1 -f /dev/stdin \
  < manual_scripts/verify_school_directory.sql
```

Production-переход описан в `PRODUCTION_SCHOOL_MIGRATION.md`.
Исходный зашифрованный снимок и резервные копии остаются основой восстановления;
рабочая папка и Docker-тома не заменяют резервную копию.


2.3.0

Причина найдена: локальный контейнер `db` остановлен (`Exited (0)`). Команда миграции запущена с `--no-deps`, поэтому Compose не поднимает БД автоматически. Из-за этого Alembic не может найти хост `db`; до выполнения миграции дело не дошло.

Из корня проекта выполните:

```bash
docker compose -f docker-compose.local.yml up -d --wait db
docker compose -f docker-compose.local.yml run --rm --no-deps api alembic upgrade head
docker compose -f docker-compose.local.yml run --rm --no-deps api alembic current
```

Для запуска всего локального приложения затем поднимите также Redis и MinIO — они сейчас тоже остановлены:

```bash
docker compose -f docker-compose.local.yml up -d --wait db redis minio
docker compose -f docker-compose.local.yml --profile worker up -d api worker beat
```

Если изменён только серверный код и новая миграция не требуется:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker up -d --build api worker
```


### 4.2. Основное приложение

В отдельном терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-main run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Адрес: http://127.0.0.1:5173/

### 4.3. Админ-панель

Ещё в одном терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-admin run dev -- --host 127.0.0.1 --port 5174 --strictPort
```