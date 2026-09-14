# Локальное зеркало для разработки версии 2.0

Рабочая директория: `/Users/alexfedosov/Documents/ni_site_v2`.

Окружение изолировано от production: используются локальные PostgreSQL, Redis и MinIO; отправка электронной почты, Sentry и OpenTelemetry отключены.

## Запуск серверной части

Docker Desktop должен быть запущен.

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker up -d
docker compose -f docker-compose.local.yml --profile worker ps
```

Проверка API:

```bash
curl -sS http://127.0.0.1:8000/health/ready
```

## Запуск интерфейсов

Главный интерфейс — в отдельном окне Терминала:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-main run dev -- --host 127.0.0.1 --port 5173
```

Административный интерфейс — во втором окне Терминала:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2/frontend
npm --workspace @ni/app-admin run dev -- --host 127.0.0.1 --port 5174
```

## Локальные адреса

- Приложение: http://127.0.0.1:5173/
- Админ-панель: http://127.0.0.1:5174/admin/
- API: http://127.0.0.1:8000/api/v1
- MinIO Console: http://127.0.0.1:9001/
- PostgreSQL: `127.0.0.1:5433`
- Redis: `127.0.0.1:6380`

Локальные пароли находятся в `.env.local`. Этот файл нельзя публиковать или добавлять в Git.

## Остановка и повторный запуск

Интерфейсы останавливаются сочетанием `Control+C` в соответствующих окнах Терминала.

Серверные сервисы можно остановить без удаления данных:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker stop
```

Повторный запуск использует уже восстановленные данные:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker up -d
```

Не запускайте `docker compose down -v`: параметр `-v` удалит локальные тома с восстановленными PostgreSQL и MinIO.

## Пересборка после изменения серверного кода

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker up -d --build api worker
```

## Диагностика

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml --profile worker ps
docker compose -f docker-compose.local.yml logs --tail=100 api worker
```

Исходный зашифрованный снимок остаётся эталоном для полного восстановления. Рабочая директория и Docker-тома являются изменяемой средой разработки и не заменяют резервную копию.

Выполните в Терминале:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
docker compose -f docker-compose.local.yml logs --tail=200 api
```

Чтобы смотреть новые записи в реальном времени:

```bash
docker compose -f docker-compose.local.yml logs --tail=200 -f api
```

Остановить просмотр: `Control+C`.

Для одновременного просмотра API и worker:

```bash
docker compose -f docker-compose.local.yml --profile worker logs --tail=200 -f api worker
```

## Справочник Region → City → School

Первичный импорт всегда начинается с dry-run:

```bash
cd /Users/alexfedosov/Documents/ni_site_v2
./manual_scripts/import_school_directory.sh \
  --compose-file docker-compose.local.yml \
  --schools temporary/ni_schools.csv \
  --users temporary/user_school.csv \
  --batch-id local-check-YYYYMMDD \
  --dry-run
```

Импортёр не очищает существующие данные и требует пустой новый каталог. Поэтому
его нельзя повторно применять к уже заполненной основной локальной БД. После
успешного apply состояние проверяется так:

```bash
docker compose -f docker-compose.local.yml exec -T db \
  psql -U postgres -d ni_site -v ON_ERROR_STOP=1 -f /dev/stdin \
  < manual_scripts/verify_school_directory.sql
```

Production-переход описан отдельно в `PRODUCTION_SCHOOL_MIGRATION.md`; локальные
команды нельзя механически выполнять на сервере.
