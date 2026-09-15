# Production runbook: Region → City → School

Этот регламент относится только к первому production-переходу на Alembic revision
`b8e7c6d5a4f3`. Команды выполняются оператором на сервере из `/opt/ni_site`.

## 1. Условия начала

Переход нельзя начинать, пока не выполнены все условия:

- изменения этапов 0–6 зафиксированы в релизе и этот релиз доступен серверу;
- `git status --short` на сервере пустой, а точный commit релиза записан оператором;
- `temporary/ni_schools.csv`, `temporary/user_school.csv` и
  `temporary/user_region_overrides.csv` доставлены на сервер отдельно;
- есть свободное место минимум для двух полных dump БД;
- локальный прогон из `temporary/stage6_report_20260914.md` принят;
- назначено окно обслуживания и запрещены новые регистрации.

Исходная пользовательская карта проверялась на dump
`ni_site_2026-09-13_22-28-41.sql.gz`. Если после момента этого dump были разрешены
регистрации или изменение города/школы, одного совпадения общего числа пользователей
недостаточно: `user_school.csv` может содержать устаревшую привязку. В этом случае
сначала остановить изменения, снять новый финальный dump, перестроить карту и
полностью повторить этап 6 на новом dump. Только после этого возвращаться к runbook.

Контрольные SHA-256 подготовленных CSV:

```text
ni_schools.csv  ed05bb73359900f013f90b14c1548456fac8e47e57780b0e6918809424c896c0
user_school.csv c906efb7f2d864c643219a43cf11f3e0b948e92c619182eacf583a097ed49351
user_region_overrides.csv 8bfaf1e0a4485029b6338a09e10aee28848104a55779fc7b939fc00e7d5cac20
```

Если к моменту остановки в production не ровно `17279` пользователей либо после
исходного dump могла измениться география хотя бы одного пользователя, применять
текущий `user_school.csv` нельзя. При расхождении множества ID импортёр остановится
сам, но устаревшую географию он обнаружить не может. Нужно построить и проверить
новую полную карту пользователей по финальному dump, затем повторить этап 6.

## 2. Предварительная проверка на сервере

```bash
cd /opt/ni_site
git branch --show-current
git status --short
git rev-parse HEAD
docker compose ps
sha256sum temporary/ni_schools.csv temporary/user_school.csv temporary/user_region_overrides.csv
```

Ожидается ветка production-релиза, пустой статус, работающие `db`, `redis`,
`minio`, `api`, `worker` и точное совпадение обеих контрольных сумм.

Проверить текущую миграцию:

```bash
docker compose exec -T api alembic -c /app/alembic.ini current
```

До обновления ожидается `6b7c8d9e0f1a`. Иное значение — `STOP` до выяснения.

## 3. Начало окна обслуживания

Остановить процессы, которые меняют БД, но оставить PostgreSQL, Redis, MinIO и
nginx. Статическая главная продолжит открываться; API, вход и регистрация временно
будут недоступны.

```bash
cd /opt/ni_site
docker compose stop api worker
docker compose ps
```

После остановки ещё раз проверить финальное число пользователей. Эта проверка —
контрольный барьер перед backup:

```bash
docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS users FROM users; SELECT count(*) AS attempts FROM attempts; SELECT count(*) AS legacy_schools FROM schools;"
```

Ожидается локальный baseline: `17279` пользователей, `12555` попыток и `427`
старых школ. Любое отличие — `STOP`; текущий пользовательский CSV нельзя применять.
Даже при полном совпадении продолжать можно только если отдельно подтверждено
отсутствие изменений пользовательской географии после исходного dump.

## 4. Финальный backup

```bash
install -d -m 700 /var/backups/ni_site
STAGE7_TS="$(date +%Y%m%d-%H%M%S)"
STAGE7_BACKUP="/var/backups/ni_site/before-school-migration-${STAGE7_TS}.sql.gz"
set -o pipefail
docker compose exec -T db pg_dump -U postgres -d ni_site --no-owner --no-privileges \
  | gzip -9 > "$STAGE7_BACKUP"
gzip -t "$STAGE7_BACKUP"
sha256sum "$STAGE7_BACKUP"
ls -lh "$STAGE7_BACKUP"
```

Записать полный путь, размер и SHA-256 вне сервера. Без успешного `gzip -t` и
сохранённой суммы продолжать нельзя.

## 5. Развёртывание backend и expand-миграция

К этому моменту сервер должен содержать точный проверенный release commit. Способ
доставки кода выбирается отдельно; не смешивать обновление Git с миграцией данных.

```bash
cd /opt/ni_site
docker compose build api worker
docker compose run --rm -T --no-deps api \
  alembic -c /app/alembic.ini upgrade b8e7c6d5a4f3
docker compose run --rm -T --no-deps api \
  alembic -c /app/alembic.ini current
```

Ожидается единственный revision `b8e7c6d5a4f3`. API и worker пока не запускать.
Миграция сохраняет старую таблицу под именем `schools_legacy` и legacy-поля
`users.country`, `users.city`, `users.school`.

## 6. Обязательный dry-run

Задать уникальное имя; dry-run полностью откатывает транзакцию:

```bash
STAGE7_BATCH="prod-${STAGE7_TS}"
set -o pipefail
./manual_scripts/import_school_directory.sh \
  --compose-file docker-compose.yml \
  --schools temporary/ni_schools.csv \
  --users temporary/user_school.csv \
  --region-overrides temporary/user_region_overrides.csv \
  --batch-id "${STAGE7_BATCH}-dry-run" \
  --dry-run \
  --review-output temporary/production_user_region_review.csv \
  | tee "temporary/${STAGE7_BATCH}-dry-run.log"
```

Ожидаемые ключевые значения:

```text
mode                              dry-run-rolled-back
regions_from_csv                  89
cities_exact_source_pairs         29266
cities_canonical_target           29171
schools_from_csv                  54517
user_mapping_rows                 17279
selected_source_rows              17011
missing_source_rows               268
not_required_users                13
unresolved_user_regions           0
unknown_source_school_ids         0
csv_users_absent_in_db            0
db_users_absent_in_csv            0
target_users_without_region       0
target_users_with_bad_school_state 0
target_users_with_bad_fk          0
```

После dry-run убедиться, что постоянные новые таблицы пусты:

```bash
docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM regions) AS regions, (SELECT count(*) FROM cities) AS cities, (SELECT count(*) FROM schools) AS schools, (SELECT count(*) FROM school_import_batches) AS batches;"
```

Все четыре значения должны быть `0`. Ошибка, review CSV или несовпадение хотя бы
одного итога означает `STOP`, а не ручное исправление production-БД.

## 7. Применение импорта

Только после независимой сверки dry-run:

```bash
set -o pipefail
./manual_scripts/import_school_directory.sh \
  --compose-file docker-compose.yml \
  --schools temporary/ni_schools.csv \
  --users temporary/user_school.csv \
  --region-overrides temporary/user_region_overrides.csv \
  --batch-id "$STAGE7_BATCH" \
  --apply \
  --review-output temporary/production_user_region_review.csv \
  | tee "temporary/${STAGE7_BATCH}-apply.log"
```

Повторный запуск с тем же `batch_id` запрещён импортёром. При любой ошибке вся
транзакция откатывается.

## 8. SQL-проверки и решение о запуске

```bash
set -o pipefail
docker compose exec -T db psql -U postgres -d ni_site -v ON_ERROR_STOP=1 \
  -f /dev/stdin < manual_scripts/verify_school_directory.sql \
  | tee "temporary/${STAGE7_BATCH}-sql-check.log"
```

В первой таблице каждая строка должна иметь `passed = t`. Ожидаемое распределение
старых пользователей: `selected=17011`, `missing=255`, `not_required=13`.
Также вручную сравнить пользователей и попытки с baseline из шага 3.

Если проверки не пройдены, API/worker не запускать и перейти к разделу отката.

## 9. Frontend и запуск сервисов

```bash
cd /opt/ni_site/frontend
npm ci
npm run build:app
npm run build:admin
rsync -a --delete /opt/ni_site/frontend/apps/main/dist/ /var/www/nevsky-integral/
rsync -a --delete /opt/ni_site/frontend/apps/admin/dist/ /var/www/nevsky-integral/admin/

cd /opt/ni_site
docker compose up -d api worker
docker compose ps
curl -fsS http://127.0.0.1:8000/api/v1/health/ready
curl -fsS https://www.nevsky-integral.ru/api/v1/lookup/regions
```

## 10. Smoke-проверки

Выполнить через браузер без изменения существующих production-пользователей:

1. Главная страница открывается.
2. Форма регистрации загружает регионы и ищет школу по двум символам.
3. В предложении есть город, но нет адреса.
4. Student со статусом `selected` входит в кабинет; регион и школа заблокированы.
5. Teacher входит и видит своих учеников.
6. Admin видит пагинацию школ, признаки Consortium/Peterson/Sirius, пользователей
   и заявки школ; admin может менять регион и школу пользователя.
7. Проверить чтение существующей попытки и доступность разрешённого диплома.

В первые часы наблюдать 4xx/5xx, readiness, время `/lookup/schools`, ошибки FK и
Celery. Не удалять backup, `schools_legacy`, legacy-поля или `school_source_map`.

## 11. Откат

Не выполнять `alembic downgrade` на рабочей production-БД. Безопаснее сохранить
неудачное состояние и восстановить backup в новую БД:

```bash
docker compose stop api worker
STAGE7_ROLLBACK_DB="ni_site_rollback_${STAGE7_TS}"
docker compose exec -T db createdb -U postgres "$STAGE7_ROLLBACK_DB"
gzip -cd "$STAGE7_BACKUP" \
  | docker compose exec -T db psql -U postgres -d "$STAGE7_ROLLBACK_DB" -v ON_ERROR_STOP=1
docker compose exec -T db psql -U postgres -d "$STAGE7_ROLLBACK_DB" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS users FROM users; SELECT count(*) AS attempts FROM attempts; SELECT count(*) AS schools FROM schools;"
```

После проверки изменить имя БД в `DATABASE_URL`/`ALEMBIC_DATABASE_URL` на новую,
вернуть предыдущий release commit backend/frontend, пересобрать и запустить API и
worker. Исходную мигрированную БД и backup не удалять до разбора причины.
