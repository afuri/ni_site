# API Conventions

Base URL: `/api/v1`

## Pagination

- Default: `limit` + `offset`
- Params: `limit` (min 1, max 200), `offset` (min 0)
- Default values: `limit=50`, `offset=0`

Example:
```
GET /content?limit=50&offset=0
```

## Filtering

Filtering uses explicit query params per endpoint. Common patterns:

- `content_type` for content
- `status` for content/admin lists
- `subject`, `task_type` for tasks
- `age_group`, `mine` for olympiads
- `from_dt`, `to_dt`, `status_code` for audit logs
- `region_id`, `school_id`, `school_status` for users
- `region_id`, `city_id`, `query`, `is_active` and boolean group flags for schools

Example:
```
GET /admin/content?content_type=article&status=published
```

## School directory lookup

- `GET /lookup/regions`: `query` optional, `limit` 1..100.
- `GET /lookup/schools`: required `region_id` and `query` (minimum two non-space
  characters), `limit` 1..50.
- Поиск школы выполняется как регистронезависимое вхождение подстроки только
  внутри выбранного региона. Символы `%` и `_` трактуются буквально.
- Публичный ответ школы содержит только `id`, `short_name`, `full_name`, `city`.
- `GET /lookup/cities` оставлен временно как deprecated compatibility endpoint.

Admin-списки школ и заявок используют `limit` + `offset`; каталог из 54 517 школ
не загружается одним запросом.

## Sorting

Sorting is not globally exposed. If an endpoint supports sorting, it will declare:

- `sort_by` (field)
- `sort_dir` (`asc` | `desc`)

If absent, ordering is implementation-defined and documented in that endpoint.

## Uploads (presign)

- Allowed prefixes: `tasks/` or `content/` (max depth 3 segments)
- Allowed content types: defined by `STORAGE_ALLOWED_CONTENT_TYPES`
- Max file size: `STORAGE_MAX_UPLOAD_MB` (applies to presign-post)
- Presign TTL: `STORAGE_PRESIGN_EXPIRES_SEC`

Presign endpoints:
```
POST /uploads/presign
POST /uploads/presign-post
```
