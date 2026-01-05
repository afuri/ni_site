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

Example:
```
GET /admin/content?content_type=article&status=published
```

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
